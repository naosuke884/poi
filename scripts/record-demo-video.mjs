#!/usr/bin/env node
// ランディングと README のデモ動画 (public/demo*.mp4) とポスター (public/demo-poster*.webp) を撮り直す。
//
//   node scripts/record-demo-video.mjs [--variant desktop|phone] [--scheme light|dark] [--out <dir>]
//
// 開発サーバー (:5173) とローカルの D1 で、デモ用のユーザーの板を毎回同じ内容に作り直してから、
// Playwright のサイドカーで操作を録画し、ffmpeg で mp4 (H.264) と webp のポスターにする。
// 押す場所が分かるよう、カーソル (PC) とタップの印 (スマホ) を描き足す。PC 版は、ランディングでは縮めて
// 置くので字が小さく、操作している場所へ寄って (書いている間・コピーするとき) 撮る。
// 出力は --out (既定はリポジトリの外の一時ディレクトリ) に書き、public/ は上書きしない
// (撮れた動画を見てから入れ替える。README の埋め込みは scripts/sync-demo-video.sh)。
//
// 必要なもの:
// - scripts/dev-server.sh start で開発サーバーが動いていること
// - Playwright のサイドカー (PW_TEST_CONNECT_WS_ENDPOINT)。接続は verifying-in-app スキルの pw.mjs を使う
// - ffmpeg。無ければ ffmpeg-static を ~/.cache/poi-ffmpeg に入れて使う (package.json には足さない:
//   撮り直すときにしか要らず、CI や本番のビルドに 80MB のバイナリを持ち込まないため)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { openPage } from "../.claude/skills/verifying-in-app/scripts/pw.mjs";

const { values } = parseArgs({
  options: {
    variant: { type: "string", default: "desktop" },
    scheme: { type: "string", default: "light" },
    out: { type: "string" },
  },
});

// desktop: PC のページ全体 (ヘッダー込み)。issue #138 で決めた 1280×800 (2 倍の画素で 2560×1600)。
// phone: スマホの縦長の画面。スマホではランディングの列が狭く、PC の録画は文字が読めないため (HAY-53)
const VARIANTS = {
  desktop: { viewport: { width: 1280, height: 800 } },
  // isMobile / hasTouch: スマホと同じく、ツールチップを出さず (hover: none)、追加ボタンを右下の丸いボタンにする
  phone: { viewport: { width: 390, height: 720 }, isMobile: true, hasTouch: true },
};
const variant = VARIANTS[values.variant];
if (!variant || !["light", "dark"].includes(values.scheme)) {
  console.error(
    "usage: record-demo-video.mjs [--variant desktop|phone] [--scheme light|dark] [--out dir]",
  );
  process.exit(2);
}
const SCALE = 2;
// 寄るときの最大の倍率。ランディングの Retina の画面 (928px 幅 = 1856 画素) では 2560 / 1856 ≒ 1.4 倍までは
// 撮った画素のままで、それ以上はわずかにぼやける。字を読める大きさにするのを優先して 1.7 倍まで寄る
const MAX_ZOOM = 1.7;
// 録画で日本語に使うフォント (Google Fonts)
const FONT = { family: "Noto Sans JP", query: "Noto+Sans+JP:wght@400;700" };
const outDir = values.out ?? mkdtempSync(join(tmpdir(), "poi-demo-video-"));
mkdirSync(outDir, { recursive: true });
const suffix = `${values.scheme === "dark" ? "-dark" : ""}${values.variant === "phone" ? "-phone" : ""}`;

// ---- ffmpeg ----

function ffmpegPath() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return "ffmpeg";
  } catch {
    const dir = join(homedir(), ".cache", "poi-ffmpeg");
    if (!existsSync(join(dir, "node_modules", "ffmpeg-static"))) {
      console.error(`installing ffmpeg-static into ${dir}`);
      mkdirSync(dir, { recursive: true });
      execFileSync("npm", ["install", "--prefix", dir, "--no-save", "ffmpeg-static@5"], {
        stdio: "inherit",
      });
    }
    return createRequire(join(dir, "index.js"))("ffmpeg-static");
  }
}

// ---- 板の内容 ----

const DAY_MS = 24 * 60 * 60 * 1000;
// 書いた日が違うセクション (寿命のバーの長さが違って見えるように)。何日前に書いたか
const SEED_SECTIONS = [
  { daysAgo: 29, content: "# 読みたい本\n- 砂の女\n- 深夜特急" },
  { daysAgo: 18, content: "# 買い物\n- 牛乳\n- コーヒー豆" },
  { daysAgo: 4, content: "- 美容院の予約を取る\n- 傘を返す" },
];

function sqlString(s) {
  return `'${s.replaceAll("'", "''")}'`;
}

/** デモ用のユーザーでログインし、その板を SEED_SECTIONS だけにする (ローカルの D1 のみ) */
function seedBoard(stateFile) {
  execFileSync(
    "node",
    [
      ".claude/skills/verifying-in-app/scripts/seed-session.mjs",
      "--email",
      "demo-video@example.com",
      "--name",
      "デモ",
      "--out",
      stateFile,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  const now = Date.now();
  const userId = `(select id from user where email = 'demo-video@example.com')`;
  const inserts = SEED_SECTIONS.map(({ daysAgo, content }, position) => {
    const created = now - daysAgo * DAY_MS;
    return `insert into memo (id, user_id, content, position, created_at, updated_at, expires_at) values (${sqlString(crypto.randomUUID())}, ${userId}, ${sqlString(content)}, ${position}, ${created}, ${created}, ${created + 30 * DAY_MS});`;
  });
  const sql = [
    `delete from memo where user_id = ${userId};`,
    `delete from user_setting where user_id = ${userId};`,
    ...inserts,
  ].join("\n");
  // 必ず --local (本番の D1 には触れない)
  execFileSync("npx", ["wrangler", "d1", "execute", "poi", "--local", "--command", sql], {
    stdio: ["ignore", "ignore", "inherit"],
  });
}

// ---- 操作 ----

const pause = (page, ms) => page.waitForTimeout(ms);

/** 人が打っているように 1 文字ずつ入れる (keyboard.type は CodeMirror の自動整形を通るので、文字は insertText で) */
async function typeSlowly(page, text) {
  for (const ch of text) {
    // 改行は Enter で (insertText の "\n" は板の区切りの判定と食い違い、セクションが余計に分かれた)
    if (ch === "\n") await page.keyboard.press("Enter");
    else await page.keyboard.insertText(ch);
    await pause(page, ch === "\n" ? 260 : 70);
  }
}

// ---- カーソルとタップの印 ----

/**
 * 録画用のブラウザにはマウスカーソルが映らず、ボタンを押しても急に画面が変わったようにしか見えないので、
 * ページの一番上にカーソルの絵を置いて、押す場所まで動かす (スマホはタップした所に丸い印を出す)
 */
async function installPointer(page) {
  await page.addStyleTag({
    content: `
      #demo-cursor {
        position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; opacity: 0;
        transition: transform var(--move, 0ms) cubic-bezier(0.45, 0, 0.2, 1), opacity 200ms;
        filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35));
      }
      .demo-press { position: fixed; z-index: 2147483647; pointer-events: none; border-radius: 50%; translate: -50% -50%; }
    `,
  });
  await page.evaluate(() => {
    const cursor = document.createElement("div");
    cursor.id = "demo-cursor";
    cursor.innerHTML =
      '<svg width="20" height="28" viewBox="0 0 20 28"><path d="M1 1 L1 22 L6.5 17 L10.5 26 L14 24.5 L10 15.5 L17.5 15.5 Z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.append(cursor);
  });
}

let cursorAt = null;

/** カーソルを (x, y) までなめらかに動かす。最初は右下から入ってくる */
async function moveCursor(page, x, y) {
  const from = cursorAt ?? { x: x + 180, y: y + 140 };
  const ms = Math.round(Math.min(900, Math.max(450, Math.hypot(x - from.x, y - from.y) * 1.2)));
  await page.evaluate(
    ({ from, x, y, ms }) => {
      const cursor = document.getElementById("demo-cursor");
      const place = (p, d) => {
        cursor.style.setProperty("--move", `${d}ms`);
        // 絵の矢印の先は (1, 1)
        cursor.style.transform = `translate(${p.x - 1}px, ${p.y - 1}px)`;
      };
      if (cursor.style.opacity !== "1") {
        place(from, 0);
        cursor.getBoundingClientRect();
        cursor.style.opacity = "1";
      }
      place({ x, y }, ms);
    },
    { from, x, y, ms },
  );
  cursorAt = { x, y };
  await pause(page, ms + 80);
}

/** 文字を打つ間はカーソルを消す (OS と同じく、打ち始めると見えなくなる) */
const hideCursor = (page) =>
  page.evaluate(() => {
    document.getElementById("demo-cursor").style.opacity = "0";
  });

/** 押した所に印を出す。PC はカーソルの先に広がる輪、スマホは指の大きさの丸 */
const showPress = (page, x, y) =>
  page.evaluate(
    ({ x, y, touch }) => {
      const mark = document.createElement("div");
      mark.className = "demo-press";
      const size = touch ? 48 : 36;
      Object.assign(mark.style, {
        left: `${x}px`,
        top: `${y}px`,
        width: `${size}px`,
        height: `${size}px`,
        ...(touch
          ? { background: "rgb(128 128 128 / 0.35)", border: "2px solid rgb(255 255 255 / 0.6)" }
          : { border: "2px solid var(--mantine-primary-color-filled)" }),
      });
      document.body.append(mark);
      const frames = touch
        ? [
            { opacity: 1, scale: 0.6 },
            { opacity: 1, scale: 1, offset: 0.4 },
            { opacity: 0, scale: 1.1 },
          ]
        : [
            { opacity: 0.9, scale: 0.3 },
            { opacity: 0, scale: 1.3 },
          ];
      mark.animate(frames, { duration: touch ? 650 : 500, easing: "ease-out" }).onfinish = () =>
        mark.remove();
    },
    { x, y, touch: Boolean(variant.hasTouch) },
  );

/**
 * カーソルを動かしてから押す (dwell: 押す前に止まる時間。ツールチップを見せる)。
 * スマホではタップで押す (クリックだとマウスが残り、ボタンのツールチップが出たままになる)
 */
async function press(page, locator, { dwell = 150 } = {}) {
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (variant.hasTouch) {
    await locator.tap();
    await showPress(page, x, y);
    return;
  }
  await moveCursor(page, x, y);
  await locator.hover();
  await pause(page, dwell);
  await showPress(page, x, y);
  await locator.click();
}

// ---- 寄る (PC 版だけ) ----

// 撮りながら決める寄り先。at: 時刻 (秒)、dur: 動く長さ (秒)、rect: 映す範囲 (CSS ピクセル。null は画面全体)
const shots = [];

/** rect へ寄る (null で引いて全体)。スマホ版は字が大きいので寄らない */
function look(rect, dur = 0.9) {
  if (!variant.hasTouch) shots.push({ at: Date.now() / 1000, dur, rect });
}

// 寄るときに映す幅 (CSS ピクセル)。板の列は 1100px 前後と広く、列ごと映すとほとんど寄れないので、
// 書いている間は行の頭から、コピーのときはボタンから見出しの方へ、この幅だけを映す
const TYPING_WIDTH = 620;
const COPY_WIDTH = 900;

/** 文字を打っている行のまわり */
const caretArea = (page) =>
  page
    .evaluate(() => {
      const editor = document.activeElement?.closest(".cm-editor")?.getBoundingClientRect();
      const node = getSelection()?.focusNode;
      const line = (node instanceof Element ? node : node?.parentElement)
        ?.closest(".cm-line")
        ?.getBoundingClientRect();
      if (!editor || !line) return null;
      return { x: editor.left, y: line.top - 120, height: line.height + 240 };
    })
    .then((area) => area && { ...area, width: TYPING_WIDTH });

/** ボタンのまわり (左にある見出しや本文が入るように、ボタンから左へ COPY_WIDTH) */
async function areaLeftOf(locator) {
  const box = await locator.boundingBox();
  const right = box.x + box.width + 24;
  return { x: right - COPY_WIDTH, y: box.y - 130, width: COPY_WIDTH, height: box.height + 260 };
}

// 表示の切り替え (SegmentedControl)。中の radio は見えないので、押せる label を押す
const viewToggle = (page, name) =>
  page.getByRole("radiogroup", { name: "板の表示方法" }).locator("label").filter({ hasText: name });

async function scenario(page) {
  await pause(page, 1500);
  // 新しいセクションを書く
  await press(page, page.getByRole("button", { name: "セクションを追加" }).first());
  await pause(page, 300);
  await hideCursor(page);
  look(await caretArea(page));
  await pause(page, 700);
  await typeSlowly(page, "# 今日のやること\n企画書を見直す\n打ち合わせ 13 時");
  await pause(page, 600);
  // 空行 2 つで区切って、同じ見出しのセクションをもう 1 つ (区切った先の行へカメラを移す)
  await typeSlowly(page, "\n\n\n");
  look(await caretArea(page), 0.7);
  await typeSlowly(page, "# 買い物\n電池");
  await pause(page, 800);
  await page.keyboard.press("Escape");
  look(null, 1);
  await pause(page, 1500);
  // 見出しごとにまとめて読む (並びが変わるのを全体で見せる)
  await press(page, viewToggle(page, "まとめ"));
  await pause(page, 2500);
  // まとめた「買い物」をコピーする
  const copy = page.getByRole("button", { name: /買い物.*をコピー/ }).first();
  look(await areaLeftOf(copy));
  await press(page, copy, { dwell: 500 });
  await pause(page, 1800);
  // 引いて、書いた順の表示に戻る
  look(null);
  await press(page, viewToggle(page, "タイムライン"));
  await pause(page, 2000);
}

// ---- 録画 ----

/**
 * 撮り終えるまでスクリーンショットを撮り続けてコマにする (2 倍の画素で 1 秒に 10 コマ前後)。
 * Playwright の recordVideo も CDP の screencast も CSS ピクセルの大きさ (1280×800) でしか撮れず、
 * ランディングで Retina の画面に置くと文字がぼやけるため
 */
function startCapture(page) {
  const frames = [];
  let recording = true;
  const loop = (async () => {
    while (recording) {
      const at = Date.now() / 1000;
      const data = await page.screenshot({ type: "jpeg", quality: 92 });
      frames.push({ data, at });
    }
  })();
  return async () => {
    recording = false;
    await loop;
    return frames;
  };
}

/**
 * 寄り先 (shots) を、ffmpeg の zoompan の式にする。倍率と映す中心を、前の寄り先から次の寄り先へ
 * ゆっくり動かす (時刻 it は動画の先頭からの秒)。寄り先が無ければ (スマホ版) 何もしない
 */
function cameraFilter(start) {
  if (shots.length === 0) return [];
  const { width: vw, height: vh } = variant.viewport;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const whole = { z: 1, cx: (vw * SCALE) / 2, cy: (vh * SCALE) / 2 };
  const target = (rect) => {
    if (!rect) return whole;
    const pad = 48;
    const z = clamp(
      Math.min(vw / (rect.width + pad * 2), vh / (rect.height + pad * 2)),
      1,
      MAX_ZOOM,
    );
    // 画面の外を映さないように中心を寄せる
    const cx = clamp(rect.x + rect.width / 2, vw / z / 2, vw - vw / z / 2);
    const cy = clamp(rect.y + rect.height / 2, vh / z / 2, vh - vh / z / 2);
    return { z, cx: cx * SCALE, cy: cy * SCALE };
  };
  const moves = [];
  let from = whole;
  let free = 0;
  for (const { at, dur, rect } of shots) {
    // 前の動きが終わってから動く (式を区間ごとに分けるため)
    const t = Math.max(at - start, free);
    const to = target(rect);
    moves.push({ t, dur, from, to });
    from = to;
    free = t + dur;
  }
  const n = (v) => v.toFixed(3);
  const curve = (key) =>
    moves.reduceRight(
      (rest, m) =>
        `if(lt(it,${n(m.t)}),${n(m.from[key])},if(lt(it,${n(m.t + m.dur)}),${n(m.from[key])}+(${n(m.to[key] - m.from[key])})*(1-cos(PI*(it-${n(m.t)})/${n(m.dur)}))/2,${rest}))`,
      n(from[key]),
    );
  return [
    `zoompan=z='${curve("z")}'` +
      `:x='clip(${curve("cx")}-iw/zoom/2,0,iw-iw/zoom)'` +
      `:y='clip(${curve("cy")}-ih/zoom/2,0,ih-ih/zoom)'` +
      `:d=1:s=${vw * SCALE}x${vh * SCALE}:fps=30`,
  ];
}

/** コマを、撮った時刻どおりの長さで並べた mp4 にする (コマの間隔は撮るのにかかった時間で揃わない) */
function encode(frames, endAt, mp4) {
  const dir = join(outDir, "frames");
  mkdirSync(dir, { recursive: true });
  const list = [];
  frames.forEach((f, i) => {
    const file = join(dir, `${String(i).padStart(5, "0")}.jpg`);
    writeFileSync(file, f.data);
    const next = frames[i + 1]?.at ?? endAt;
    list.push(`file '${file}'`, `duration ${Math.max(0.04, next - f.at).toFixed(3)}`);
  });
  // concat の最後のコマは duration が効かないので、もう一度並べる
  list.push(`file '${join(dir, `${String(frames.length - 1).padStart(5, "0")}.jpg`)}'`);
  const listFile = join(dir, "list.txt");
  writeFileSync(listFile, list.join("\n"));
  // 音声なし、どのブラウザでも再生できる H.264 / yuv420p (幅と高さは偶数)、先頭から再生できるよう moov を前に
  execFileSync(ffmpegPath(), [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-vf",
    ["fps=30", ...cameraFilter(frames[0].at), "scale=trunc(iw/2)*2:trunc(ih/2)*2"].join(","),
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "30",
    "-preset",
    "slow",
    "-movflags",
    "+faststart",
    mp4,
  ]);
}

async function record() {
  const stateFile = join(outDir, "state.json");
  seedBoard(stateFile);
  const { browser, page } = await openPage({
    ...variant,
    storageState: stateFile,
    deviceScaleFactor: SCALE,
    colorScheme: values.scheme,
    // 「コピー」を押したときに「失敗しました」にならないように
    permissions: ["clipboard-read", "clipboard-write"],
  });
  let frames;
  let endAt;
  try {
    await page.goto("http://localhost:5173/board", { waitUntil: "networkidle" });
    // サイドカーには中国語のフォントしか無く、日本語の字形が違って見えるので、録画のときだけ日本語のフォントを足す。
    // 見出しは body を継がず Mantine の変数で字体を決めるので、変数ごと (Mantine が後から入れる :root より強く) 置き換える
    const stack = `"Inter Variable", "${FONT.family}", sans-serif`;
    await page.addStyleTag({
      url: `https://fonts.googleapis.com/css2?family=${FONT.query}&display=block`,
    });
    await page.addStyleTag({
      content: `:root { --mantine-font-family: ${stack} !important; --mantine-font-family-headings: ${stack} !important; }`,
    });
    // 字はページに出てから読み込まれるので、本文と見出し (太字) の分を先に読み込んでから撮り始める
    await page.evaluate(async (family) => {
      const text = document.body.innerText + "今日のやること企画書を見直す打ち合わせ時買い物電池";
      await Promise.all(
        ["400", "700"].map((w) => document.fonts.load(`${w} 16px "${family}"`, text)),
      );
    }, FONT.family);
    // 開発時だけ出る TanStack Router の開発ツールのボタンは映さない
    await page.evaluate(() =>
      document.querySelectorAll('button[class^="go"]').forEach((b) => b.closest("div")?.remove()),
    );
    // 板は最後のセクションまで送った位置で開くので、先頭に戻して寿命の違うセクションが並んだ所から撮る
    await page.evaluate(() => scrollTo(0, 0));
    await installPointer(page);
    await pause(page, 300);
    const stop = startCapture(page);
    await scenario(page);
    endAt = Date.now() / 1000;
    frames = await stop();
  } finally {
    await browser.close();
  }
  const mp4 = join(outDir, `demo${suffix}.mp4`);
  const poster = join(outDir, `demo-poster${suffix}.webp`);
  encode(frames, endAt, mp4);
  // ポスターは内容の入った最後のコマ (先頭のコマだと読み込み中に空に近い板が見える。issue #97)。
  // それより前は、PC 版では引いている途中のことがある
  execFileSync(ffmpegPath(), [
    "-y",
    "-loglevel",
    "error",
    "-sseof",
    "-0.5",
    "-i",
    mp4,
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    "80",
    poster,
  ]);
  console.log(`wrote ${mp4}\nwrote ${poster}`);
}

await record();
