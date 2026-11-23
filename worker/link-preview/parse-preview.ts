// 取ってきた HTML の先頭から、プレビューに出す題名とサイト名を取り出す (DOM を作らない、行儀の悪い HTML でも落ちない近似)。
// タグは前から 1 回だけなめて読む (正規表現でタグを探さない・名前ごとに探し直さない): 閉じないタグや引用符が並ぶページで、
// 探し直すたびに末尾まで読んで CPU を使い切る (1 回の取得で秒単位) うえ、= の直後でない引用符を値の始まりと取り違えたり、
// 別のタグの属性値やコメント・script の中の <title> を拾ったりするため

/** プレビューに出す題名の長さの上限 (長すぎる題名で 1 行の札を押し広げない) */
export const TITLE_MAX_LENGTH = 200;

export type LinkPreview = { title: string; siteName: string | null };

/** 題名の候補を、書記素に分ける前に切る長さ (長い題名で CPU を使わないように。上限より十分長く) */
const RAW_MAX_LENGTH = TITLE_MAX_LENGTH * 16;

/** 文字参照の名前 → 文字 (題名やサイト名に出てくるものだけ。知らない名前はそのまま見せる) */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
};

/**
 * 128〜159 の番号の文字参照が指す文字 (HTML の仕様の表。windows-1252 の記号。表に無い番号はその番号の文字のまま)。
 * 古いページは「&#151;」などでダッシュや引用符を書いていることがある (番号どおりだと見えない制御文字になる)
 */
const C1_REPLACEMENTS: Record<number, string> = {
  0x80: "€",
  0x82: "‚",
  0x83: "ƒ",
  0x84: "„",
  0x85: "…",
  0x86: "†",
  0x87: "‡",
  0x88: "ˆ",
  0x89: "‰",
  0x8a: "Š",
  0x8b: "‹",
  0x8c: "Œ",
  0x8e: "Ž",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0x98: "˜",
  0x99: "™",
  0x9a: "š",
  0x9b: "›",
  0x9c: "œ",
  0x9e: "ž",
  0x9f: "Ÿ",
};

/**
 * HTML の文字参照 (&amp; &#39; &#x3042; など) を文字に戻す。文字にできない番号 (0・サロゲート) は置き換え文字、
 * 128〜159 は C1_REPLACEMENTS
 */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] !== "#") {
      // 表に無い名前はそのまま (Object から受け継いだ constructor などを拾わない)
      const name = body.toLowerCase();
      return Object.hasOwn(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name]! : whole;
    }
    const code =
      body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
    if (!Number.isFinite(code) || code > 0x10ffff) return whole;
    const c1 = C1_REPLACEMENTS[code];
    if (c1 !== undefined) return c1;
    return code === 0 || (code >= 0xd800 && code <= 0xdfff) ? "�" : String.fromCodePoint(code);
  });
}

/** HTML の空白 (半角だけ。全角の空白は文字として残す: ブラウザの題名も詰めない) */
const isSpace = (c: string | undefined) =>
  c === " " || c === "\t" || c === "\n" || c === "\f" || c === "\r";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * 文字参照を戻し、空白の並びを 1 つにして前後を落とし、長すぎれば切って … を付ける。見た目の 1 文字 (書記素) で数えて切る
 * (UTF-16 の長さで切ると絵文字が半分に割れ、コードポイントで切っても 👨‍👩‍👧 や濁点の合成が割れる)。
 * 文字参照は先に戻す (&#32; や &nbsp; で書いた空白も詰め、切るところで文字参照を割らない。戻すのは入力の長さに比例する)。
 * 何も残らなければ (空白だけ) 空文字
 */
function clean(text: string): string {
  const normalized = decodeEntities(text)
    .replace(/[\t\n\f\r ]+/g, " ")
    .replace(/^ | $/g, "");
  if (!/\S/u.test(normalized)) return "";
  const cut = normalized.length > RAW_MAX_LENGTH;
  const chars: string[] = [];
  for (const { segment } of graphemes.segment(normalized.slice(0, RAW_MAX_LENGTH))) {
    if (chars.length > TITLE_MAX_LENGTH) break;
    chars.push(segment);
  }
  if (chars.length <= TITLE_MAX_LENGTH && !cut) return chars.join("");
  // 切った: 最後の 1 文字は途中で切れていることがあるので落とし、上限の 1 文字前までにして … を付ける
  return `${chars.slice(0, Math.min(TITLE_MAX_LENGTH - 1, chars.length - 1)).join("")}…`;
}

/**
 * html の start から開始タグの属性を読み (名前は小文字 → 値。同じ名前は最初のもの)、タグの直後の位置と返す。
 * 引用符は = の直後のものだけを値の始まりとする (ブラウザと同じ)。閉じない引用符で終わりまで来たら null
 */
function readAttributes(
  html: string,
  start: number,
): { attrs: Map<string, string>; end: number } | null {
  const attrs = new Map<string, string>();
  let i = start;
  while (i < html.length) {
    const c = html[i];
    if (c === ">") return { attrs, end: i + 1 };
    if (isSpace(c) || c === "/") {
      i++;
      continue;
    }
    // 属性名 (= で始まるときも 1 文字は名前に含める。ブラウザと同じ)
    let j = i + 1;
    while (j < html.length && !isSpace(html[j]) && !"/>=".includes(html[j]!)) j++;
    const name = html.slice(i, j).toLowerCase();
    let k = j;
    while (isSpace(html[k])) k++;
    let value = "";
    if (html[k] === "=") {
      k++;
      while (isSpace(html[k])) k++;
      const quote = html[k];
      if (quote === '"' || quote === "'") {
        const close = html.indexOf(quote, k + 1);
        if (close < 0) return null;
        value = html.slice(k + 1, close);
        k = close + 1;
      } else {
        let e = k;
        while (e < html.length && !isSpace(html[e]) && html[e] !== ">") e++;
        value = html.slice(k, e);
        k = e;
      }
      i = k;
    } else {
      i = j;
    }
    if (!attrs.has(name)) attrs.set(name, value);
  }
  return null;
}

/** 中身を HTML として読まない要素 (その終わりのタグまでを飛ばす。中の <title> や <meta> を拾わないように) */
const RAW_TEXT = new Set([
  "script",
  "style",
  "textarea",
  "noscript",
  "template",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
]);

/** lastIndex の位置にある </head (sticky) */
const HEAD_END = /<\/head(?=[\t\n\f\r />])/iy;

/**
 * from から先で、コメントを閉じる --> か --!> (先に来る方) の直後の位置。無ければ -1。
 * 次の「--」を前から順に見るだけにする (--> と --!> をそれぞれ末尾まで探すと、片方しか使わないページで
 * コメントのたびに末尾まで読み、コメントの多いページで CPU を使い切る)
 */
function commentEnd(html: string, from: number): number {
  for (let k = html.indexOf("--", from); k >= 0; k = html.indexOf("--", k + 1)) {
    if (html[k + 2] === ">") return k + 3;
    if (html.startsWith("!>", k + 2)) return k + 4;
  }
  return -1;
}

/**
 * html の from から先の、name 要素の終わりのタグ (</name の後に空白・/・> か終わりが続くもの) の位置。無ければ -1。
 * 大文字小文字は区別しない (html を丸ごと小文字にした写しを作らない: 長いページで CPU を使い、İ などは長さが変わる)
 */
function endTagAt(html: string, name: string, from: number): number {
  // 名前の後ろを区切るのは HTML の空白 (半角) と / と > だけ (\\s だと全角の空白や NBSP でも区切ってしまう)
  const re = new RegExp(`</${name}(?=[\\t\\n\\f\\r />]|$)`, "gi");
  re.lastIndex = from;
  return re.exec(html)?.index ?? -1;
}

/**
 * HTML を前から 1 回だけ読み、<meta> の属性 (出てきた順) と最初の <title> の中身を集める。読むのは <head> の中だけ
 * (<body> か </head> で終わる。本文の SVG のアイコンの <title> などを拾わないように。題名や <meta> は <head> に書く)。
 * コメントと、中身を HTML として読まない要素 (script など) は飛ばす。どのタグも属性ごと読むので、
 * 属性値の中の「<title>」も拾わない。読めないところ (閉じない引用符・コメント・要素) まで来たら、そこで終わる
 */
function scanHead(html: string): { metas: Map<string, string>[]; title: string | null } {
  const metas: Map<string, string>[] = [];
  let title: string | null = null;
  let i = 0;
  for (;;) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    const next = html[lt + 1];
    if (html.startsWith("<!--", lt)) {
      // <!--> と <!---> も (ブラウザと同じく) そこで終わるコメント
      if (html[lt + 4] === ">") i = lt + 5;
      else if (html.startsWith("->", lt + 4)) i = lt + 6;
      else {
        const end = commentEnd(html, lt + 4);
        if (end < 0) break;
        i = end;
      }
      continue;
    }
    if (next === "/") {
      const end = html.indexOf(">", lt);
      if (end < 0) break;
      HEAD_END.lastIndex = lt;
      if (HEAD_END.test(html)) break;
      i = end + 1;
      continue;
    }
    if (next === "!" || next === "?") {
      // <!DOCTYPE> や <?xml ?>
      const end = html.indexOf(">", lt);
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    if (next === undefined || !/[a-z]/i.test(next)) {
      i = lt + 1;
      continue;
    }
    let j = lt + 2;
    while (j < html.length && !isSpace(html[j]) && html[j] !== "/" && html[j] !== ">") j++;
    const name = html.slice(lt + 1, j).toLowerCase();
    if (name === "body") break;
    const tag = readAttributes(html, j);
    if (!tag) break;
    i = tag.end;
    if (name === "meta") {
      metas.push(tag.attrs);
    } else if (name === "title" || RAW_TEXT.has(name)) {
      const close = endTagAt(html, name, tag.end);
      if (close < 0) break;
      if (name === "title" && title === null) title = html.slice(tag.end, close);
      i = close;
    }
  }
  return { metas, title };
}

/** プレビューに使う <meta> のキー */
const PREVIEW_KEYS = new Set(["og:title", "twitter:title", "og:site_name"]);

/** PREVIEW_KEYS の <meta property|name="キー" content="..."> の、キー → 整えた content (空でない最初のもの) */
function previewMetas(metas: Map<string, string>[]): Map<string, string> {
  const found = new Map<string, string>();
  for (const attrs of metas) {
    const key = (attrs.get("property") || attrs.get("name"))?.toLowerCase();
    if (!key || !PREVIEW_KEYS.has(key) || found.has(key)) continue;
    const content = clean(attrs.get("content") ?? "");
    if (content !== "") found.set(key, content);
  }
  return found;
}

/** 題名 (og:title → twitter:title → <title> の、空でない最初のもの) とサイト名 (og:site_name)。題名が無ければ null */
export function parsePreview(html: string): LinkPreview | null {
  const head = scanHead(html);
  const meta = previewMetas(head.metas);
  const title =
    meta.get("og:title") ??
    meta.get("twitter:title") ??
    (head.title === null ? "" : clean(head.title));
  if (title === "") return null;
  return { title, siteName: meta.get("og:site_name") ?? null };
}

/** 文字コードのラベルを、TextDecoder の文字コードの名前にする (知らないラベルは null) */
function encodingOf(label: string): string | null {
  try {
    return new TextDecoder(label.trim()).encoding;
  } catch {
    return null;
  }
}

/**
 * HTML の文字コード (TextDecoder の名前): Content-Type の charset、無ければ先頭の <meta charset> /
 * http-equiv="Content-Type" の content、それも無ければ utf-8。知らないラベルは見なかったことにする。
 * <meta> で書かれたものは HTML の仕様と同じく読み替える: UTF-16 は utf-8 (その <meta> を ASCII として読めた時点で
 * UTF-16 ではない)、x-user-defined は windows-1252
 */
export function charsetOf(contentType: string | null, head: string): string {
  const charsetIn = (text: string) => /charset\s*=\s*["']?([\w-]+)/i.exec(text)?.[1];
  const headerLabel = charsetIn(contentType ?? "");
  const fromHeader = headerLabel === undefined ? null : encodingOf(headerLabel);
  if (fromHeader) return fromHeader;
  for (const attrs of scanHead(head).metas) {
    const label =
      attrs.get("charset") ??
      (attrs.get("http-equiv")?.toLowerCase() === "content-type"
        ? charsetIn(attrs.get("content") ?? "")
        : undefined);
    const encoding = label === undefined ? null : encodingOf(label);
    if (!encoding) continue;
    if (encoding.startsWith("utf-16")) return "utf-8";
    return encoding === "x-user-defined" ? "windows-1252" : encoding;
  }
  return "utf-8";
}
