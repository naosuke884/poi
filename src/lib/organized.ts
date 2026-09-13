import type { EditableSection } from "@/lib/board";

/**
 * まとめ表示 (OrganizedView) 用に、板のセクションを見出しごとにまとめ直す (#37)。
 * - 各セクションの content を ATX 見出し行 (# 〜 ######) で区切り、
 *   同じ見出しテキストの部分 (チャンク) を 1 つのグループに連結する。
 *   レベルが違っても同じテキストなら同じグループ (表示する見出し行は初出のもの)。
 * - 見出しより前の内容と見出しの無いセクションは「見出しなし」グループ (最後に置く)。
 * - グループは板の並びでの初出順、グループの中も板の並び順。データの並びは変えない (表示だけ)。
 * - 折り畳み (collapsed) は無視して全部含める (別の見方なので)。空のセクションは含めない。
 * 見出し行の判定は表示 (MarkdownView = micromark) の ATX 見出しに合わせた行単位の近似。
 * リスト項目の中の見出しなど、文脈で解釈が変わる稀な行はズレることがある (メモ用途では許容)。
 * 連結したリスト同士は 1 つのリストとしてつながって見える (それがこのビューの狙い)。
 * 番号付きリストは通し番号になる (「1.」と書いたものが「3.」と表示されることがある)
 */

export type OrganizedRange = {
  /** まとめた Markdown (content) 内での開始 / 終了位置 */
  start: number;
  end: number;
  /** 対応する元セクションと、その content 内での開始位置 (クリックで編集へ飛ぶ用) */
  sectionKey: string;
  sectionStart: number;
};

export type OrganizedGroup = {
  /** React の key 用の識別子 */
  key: string;
  /** 見出しテキスト (トリム済み)。見出しなしグループは null */
  heading: string | null;
  /** 表示する Markdown (初出の見出し行 + 各チャンクの本文を空行 1 つで連結) */
  content: string;
  /** 連結したチャンクの数 (「N か所」ラベル用) */
  chunkCount: number;
  /** グループ内で最も早い期限。未保存のセクションだけなら null */
  minExpiresAt: string | null;
  /** content の各部分 → 元セクションの位置。start 昇順 */
  ranges: OrganizedRange[];
};

/** チャンク同士のつなぎ (空行 1 つ)。段落やリストのブロック境界を保つ */
const JOINER = "\n\n";

/**
 * ATX 見出し行なら見出しテキスト (トリム済み) を返す。
 * # は 1〜6 個で直後は空白か行末、末尾の閉じ # 列 (空白の後) は落とす (CommonMark と同じ)。
 * 行頭のインデントは無制限に許す: この板は codeIndented を無効にしているので、
 * micromark は 4 スペースやタブの後の # も見出しとして描画する (CommonMark の 3 スペース制限とは違う)
 */
export function parseHeading(line: string): string | null {
  const m = /^[ \t]*#{1,6}(?:[ \t]+(.*))?$/.exec(line);
  if (!m) return null;
  return (m[1] ?? "").replace(/(?:^|[ \t]+)#+[ \t]*$/, "").trim();
}

/** セクション content を見出し行で区切った 1 つ分 */
type Chunk = {
  sectionKey: string;
  expiresAt: string | null;
  /** null は見出しより前の部分 */
  heading: { text: string; line: string; start: number } | null;
  /** 本文 (見出し行の次から次の見出し行の前まで)。前後の空行は落とし済み。空のことがある */
  body: string;
  /** body の元セクション content 内での開始位置 */
  bodyStart: number;
};

/** 本文範囲の前後から空行 (空白のみの行) を落とす */
function trimBodyRange(content: string, start: number, end: number): [number, number] {
  const raw = content.slice(start, end);
  if (raw.trim() === "") return [start, start];
  const lead = /^(?:[ \t]*\n)+/.exec(raw)?.[0].length ?? 0;
  const trail = /(?:\n[ \t]*)+$/.exec(raw.slice(lead))?.[0].length ?? 0;
  return [start + lead, end - trail];
}

/**
 * チャンク本文を連結用のパートにする。
 * 先頭行がインデントされていると、空行を挟んでも直前のパートのリスト項目の続きとして
 * 描画されてしまう (別のセクションの内容がリストの中に吸い込まれる) ので、
 * 先頭行のインデント分だけ全行を dedent する (行ごとの相対的な入れ子は保つ)。
 * dedent すると行ごとに元の位置とのずれが変わるので、対応 (ranges) は行単位で持つ
 */
function bodyPart(c: Chunk): {
  text: string;
  sectionKey: string;
  ranges: { start: number; end: number; sectionStart: number }[];
} {
  const indent = /^[ \t]*/.exec(c.body)![0].length;
  if (indent === 0)
    return {
      text: c.body,
      sectionKey: c.sectionKey,
      ranges: [{ start: 0, end: c.body.length, sectionStart: c.bodyStart }],
    };
  const out: string[] = [];
  const ranges: { start: number; end: number; sectionStart: number }[] = [];
  let src = c.bodyStart; // 元セクション内の行頭
  let dst = 0; // dedent 後のテキスト内の行頭
  for (const line of c.body.split("\n")) {
    const cut = Math.min(indent, /^[ \t]*/.exec(line)![0].length);
    const text = line.slice(cut);
    ranges.push({ start: dst, end: dst + text.length, sectionStart: src + cut });
    out.push(text);
    dst += text.length + 1;
    src += line.length + 1;
  }
  return { text: out.join("\n"), sectionKey: c.sectionKey, ranges };
}

function chunkSection(section: EditableSection): Chunk[] {
  const { content } = section;
  const chunks: Chunk[] = [];
  let heading: Chunk["heading"] = null;
  let bodyStart = 0;
  const push = (bodyEnd: number) => {
    const [s, e] = trimBodyRange(content, bodyStart, bodyEnd);
    // 見出しより前の部分は中身があるときだけ。見出し付きは本文が空でも
    // グループの存在 (と期限) を伝えるので残す
    if (heading !== null || s < e)
      chunks.push({
        sectionKey: section.key,
        expiresAt: section.expiresAt,
        heading,
        body: content.slice(s, e),
        bodyStart: s,
      });
  };
  let lineStart = 0;
  while (lineStart <= content.length) {
    const nl = content.indexOf("\n", lineStart);
    const lineEnd = nl === -1 ? content.length : nl;
    const line = content.slice(lineStart, lineEnd);
    const text = parseHeading(line);
    if (text !== null) {
      push(lineStart);
      heading = { text, line, start: lineStart };
      bodyStart = Math.min(lineEnd + 1, content.length);
    }
    if (nl === -1) break;
    lineStart = nl + 1;
  }
  push(content.length);
  return chunks;
}

export function organizeSections(sections: EditableSection[]): OrganizedGroup[] {
  // 見出しテキスト → グループのチャンク列。挿入順 = 初出順 (Map が保つ)
  const byHeading = new Map<string, Chunk[]>();
  const noHeading: Chunk[] = [];
  for (const section of sections) {
    if (section.content.trim() === "") continue;
    for (const chunk of chunkSection(section)) {
      if (chunk.heading === null) {
        noHeading.push(chunk);
      } else {
        const list = byHeading.get(chunk.heading.text);
        if (list) list.push(chunk);
        else byHeading.set(chunk.heading.text, [chunk]);
      }
    }
  }

  const build = (key: string, heading: string | null, chunks: Chunk[]): OrganizedGroup => {
    // 1 パート = 連結する 1 つのテキストと、その中の位置 → 元セクションの位置の対応
    type Part = {
      text: string;
      sectionKey: string;
      ranges: { start: number; end: number; sectionStart: number }[];
    };
    const parts: Part[] = [];
    // 見出し行は初出のものをそのまま使う (レベルもそのまま)
    const first = chunks[0]!;
    if (first.heading !== null)
      parts.push({
        text: first.heading.line,
        sectionKey: first.sectionKey,
        ranges: [{ start: 0, end: first.heading.line.length, sectionStart: first.heading.start }],
      });
    for (const c of chunks) {
      if (c.body !== "") parts.push(bodyPart(c));
    }
    const ranges: OrganizedRange[] = [];
    let offset = 0;
    const texts: string[] = [];
    for (const p of parts) {
      for (const r of p.ranges)
        ranges.push({
          start: offset + r.start,
          end: offset + r.end,
          sectionKey: p.sectionKey,
          sectionStart: r.sectionStart,
        });
      texts.push(p.text);
      offset += p.text.length + JOINER.length;
    }
    const expiries = chunks.map((c) => c.expiresAt).filter((e) => e !== null);
    return {
      key,
      heading,
      content: texts.join(JOINER),
      chunkCount: chunks.length,
      minExpiresAt:
        expiries.length > 0
          ? expiries.reduce((a, b) => (new Date(a).getTime() <= new Date(b).getTime() ? a : b))
          : null,
      ranges,
    };
  };

  const groups = [...byHeading.entries()].map(([text, chunks]) => build(`h:${text}`, text, chunks));
  if (noHeading.length > 0) groups.push(build("none", null, noHeading));
  return groups;
}

/**
 * まとめた Markdown 内の位置を、元セクションの位置に対応づける (クリックで編集へ飛ぶ用)。
 * つなぎ (JOINER) の上なら直前の部分の末尾に寄せる
 */
export function locateInSection(
  ranges: OrganizedRange[],
  offset: number,
): { sectionKey: string; pos: number } | null {
  let range: OrganizedRange | null = null;
  for (const r of ranges) {
    if (r.start > offset) break;
    range = r;
  }
  if (!range) return null;
  const clamped = Math.max(range.start, Math.min(offset, range.end));
  return { sectionKey: range.sectionKey, pos: range.sectionStart + (clamped - range.start) };
}
