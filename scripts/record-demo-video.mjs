#!/usr/bin/env node
// ランディングと README のデモ動画 (public/demo*.mp4) とポスター (public/demo-poster*.webp) を撮り直す。
//
//   node scripts/record-demo-video.mjs [--variant desktop|phone] [--scheme light|dark] [--out <dir>]
//
// 開発サーバー (:5173) とローカルの D1 で、デモ用のユーザーの板を毎回同じ内容に作り直してから、
// Playwright のサイドカーで操作を録画し、ffmpeg で mp4 (H.264) と webp のポスターにする。
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

// スマホではタップで押す (クリックだとマウスが残り、ボタンのツールチップが出たままになる)
const press = (locator) => (variant.hasTouch ? locator.tap() : locator.click());

// 表示の切り替え (SegmentedControl)。中の radio は見えないので、押せる label を押す
const viewToggle = (page, name) =>
  page.getByRole("radiogroup", { name: "板の表示方法" }).locator("label").filter({ hasText: name });

async function scenario(page) {
  await pause(page, 1500);
  // 新しいセクションを書く
  await press(page.getByRole("button", { name: "セクションを追加" }).first());
  await pause(page, 400);
  await typeSlowly(page, "# 今日のやること\n企画書を見直す\n打ち合わせ 13 時");
  await pause(page, 600);
  // 空行 2 つで区切って、同じ見出しのセクションをもう 1 つ
  await typeSlowly(page, "\n\n\n# 買い物\n電池");
  await pause(page, 800);
  await page.keyboard.press("Escape");
  await pause(page, 1500);
  // 見出しごとにまとめて読む
  await press(viewToggle(page, "まとめ"));
  await pause(page, 2500);
  // まとめた「買い物」をコピーする
  const copy = page.getByRole("button", { name: /買い物.*をコピー/ }).first();
  if (!variant.hasTouch) await copy.hover();
  await pause(page, 500);
  await press(copy);
  await pause(page, 1800);
  // 書いた順の表示に戻る
  await press(viewToggle(page, "タイムライン"));
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
    "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2",
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
  // ポスターは内容の入った後半のコマ (先頭のコマだと読み込み中に空に近い板が見える。issue #97)
  execFileSync(ffmpegPath(), [
    "-y",
    "-loglevel",
    "error",
    "-sseof",
    "-3",
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
