import type { EditableSection } from "@/lib/board";

/**
 * まとめ表示 (OrganizedView) 用に、板のセクションを見出しごとにまとめ直す (#37)。
 * - 各セクションの content を ATX 見出し行 (# 〜 ######) で区切り、見出しの階層
 *   (レベルの上下で決まる入れ子: # の下に続く ## はその子) を保ったツリーにまとめる。
 * - まとめる単位は見出しのパス (祖先の見出しテキストの並び + 自分)。
 *   パスが同じ見出し同士だけを 1 つにまとめる (そのときレベルの違いは同一視し、
 *   表示は初出の見出し行)。テキストが同じでも親が違えば別のまとめとして重複して表示する。
 * - 最上位の見出し 1 つが表示上の 1 グループ。子孫の見出しと本文はグループの中に
 *   「見出し行 → その直下の本文 (板の並び順) → 子見出し…」の順で連結する。
 * - 見出しより前の内容と見出しの無いセクションは「見出しなし」グループ (最後に置く)。
 * - グループと子見出しは板の並びでの初出順。データの並びは変えない (表示だけ)。
 * - 空のセクションは含めない。
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
  /** 最上位の見出しテキスト (トリム済み)。見出しなしグループは null */
  heading: string | null;
  /** 表示する Markdown (見出し行と本文をツリーの順に空行 1 つで連結) */
  content: string;
  /** 連結したチャンク (見出しの下の本文のかたまり) の数 (「N か所」ラベル用) */
  chunkCount: number;
  /** content の各部分 → 元セクションの位置。start 昇順 */
  ranges: OrganizedRange[];
  /**
   * このまとめに含めた、元セクション content 内の範囲 (まとめごと削除する用)。
   * 各チャンクの見出し行の先頭から次の見出し行の直前 (または末尾) までで、
   * 間の空行 (トリムして表示しなかった分) も含む
   */
  sources: { sectionKey: string; start: number; end: number }[];
};

/** チャンク同士のつなぎ (空行 1 つ)。段落やリストのブロック境界を保つ */
const JOINER = "\n\n";

/**
 * ATX 見出し行ならレベルと見出しテキスト (トリム済み) を返す。
 * # は 1〜6 個で直後は空白か行末、末尾の閉じ # 列 (空白の後) は落とす (CommonMark と同じ)。
 * 行頭のインデントは無制限に許す: この板は codeIndented を無効にしているので、
 * micromark は 4 スペースやタブの後の # も見出しとして描画する (CommonMark の 3 スペース制限とは違う)
 */
function parseHeading(line: string): { level: number; text: string } | null {
  const m = /^[ \t]*(#{1,6})(?:[ \t]+(.*))?$/.exec(line);
  if (!m) return null;
  return {
    level: m[1]!.length,
    text: (m[2] ?? "").replace(/(?:^|[ \t]+)#+[ \t]*$/, "").trim(),
  };
}

/** セクション content を見出し行で区切った 1 つ分 */
type Chunk = {
  sectionKey: string;
  /** null は見出しより前の部分。path は祖先の見出しテキストの並び + 自分 (ツリー上の位置) */
  heading: { path: string[]; line: string; start: number } | null;
  /** 本文 (見出し行の次から次の見出し行の前まで)。前後の空行は落とし済み。空のことがある */
  body: string;
  /** body の元セクション content 内での開始位置 */
  bodyStart: number;
  /** チャンクの占める範囲 (見出し行の先頭〜次の見出し行の直前 / 末尾。トリム前)。削除用 */
  start: number;
  end: number;
};

/** 本文範囲の前後から空行 (空白のみの行) を落とす */
function trimBodyRange(content: string, start: number, end: number): [number, number] {
  const raw = content.slice(start, end);
  if (raw.trim() === "") return [start, start];
  const lead = /^(?:[ \t]*\n)+/.exec(raw)?.[0].length ?? 0;
  const trail = /(?:\n[ \t]*)+$/.exec(raw.slice(lead))?.[0].length ?? 0;
  return [start + lead, end - trail];
}

/** 連結する 1 つのテキストと、その中の位置 → 元セクションの位置の対応 */
type Part = {
  text: string;
  sectionKey: string;
  ranges: { start: number; end: number; sectionStart: number }[];
};

/**
 * チャンク本文を連結用のパートにする。
 * 先頭行がインデントされていると、空行を挟んでも直前のパートのリスト項目の続きとして
 * 描画されてしまう (別のセクションの内容がリストの中に吸い込まれる) ので、
 * 先頭行のインデント分だけ全行を dedent する (行ごとの相対的な入れ子は保つ)。
 * dedent すると行ごとに元の位置とのずれが変わるので、対応 (ranges) は行単位で持つ
 */
function bodyPart(c: Chunk): Part {
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
  // 開いている見出しの積み重ね (階層)。新しい見出しは、自分よりレベルの浅い見出しの子になる
  const stack: { level: number; text: string }[] = [];
  let heading: Chunk["heading"] = null;
  let bodyStart = 0;
  const push = (bodyEnd: number) => {
    const [s, e] = trimBodyRange(content, bodyStart, bodyEnd);
    // 見出しより前の部分は中身があるときだけ。見出し付きは本文が空でも
    // グループの存在を伝えるので残す
    if (heading !== null || s < e)
      chunks.push({
        sectionKey: section.key,
        heading,
        body: content.slice(s, e),
        bodyStart: s,
        // 見出しなし (先頭) のチャンクはセクションの頭から
        start: heading !== null ? heading.start : 0,
        end: bodyEnd,
      });
  };
  let lineStart = 0;
  while (lineStart <= content.length) {
    const nl = content.indexOf("\n", lineStart);
    const lineEnd = nl === -1 ? content.length : nl;
    const line = content.slice(lineStart, lineEnd);
    const h = parseHeading(line);
    if (h !== null) {
      push(lineStart);
      while (stack.length > 0 && stack.at(-1)!.level >= h.level) stack.pop();
      stack.push(h);
      heading = { path: stack.map((s) => s.text), line, start: lineStart };
      bodyStart = Math.min(lineEnd + 1, content.length);
    }
    if (nl === -1) break;
    lineStart = nl + 1;
  }
  push(content.length);
  return chunks;
}

/** 見出しツリーの 1 ノード。children は初出順 (Map が保つ) */
type Node = {
  text: string;
  /** 表示する見出し行 (初出のもの) と、その元の位置 */
  headingLine: { line: string; sectionKey: string; start: number };
  chunks: Chunk[];
  children: Map<string, Node>;
};

export function organizeSections(sections: EditableSection[]): OrganizedGroup[] {
  const roots = new Map<string, Node>(); // 最上位の見出し。初出順
  const noHeading: Chunk[] = [];
  for (const section of sections) {
    if (section.content.trim() === "") continue;
    for (const chunk of chunkSection(section)) {
      if (chunk.heading === null) {
        noHeading.push(chunk);
        continue;
      }
      // パスに沿ってノードを辿る。祖先は必ず先に作られている (見出しチャンクは本文が
      // 空でも push されるので、親の見出し行が同じセクション内で先に処理される)
      let map = roots;
      let node: Node | undefined;
      for (const text of chunk.heading.path) {
        node = map.get(text);
        if (!node) {
          node = {
            text,
            headingLine: {
              line: chunk.heading.line,
              sectionKey: chunk.sectionKey,
              start: chunk.heading.start,
            },
            chunks: [],
            children: new Map(),
          };
          map.set(text, node);
        }
        map = node.children;
      }
      node!.chunks.push(chunk);
    }
  }

  // ツリーをパートの列に平らにする: 見出し行 → 直下の本文 → 子見出し… の順
  const collect = (node: Node, parts: Part[], all: Chunk[]) => {
    parts.push({
      text: node.headingLine.line,
      sectionKey: node.headingLine.sectionKey,
      ranges: [{ start: 0, end: node.headingLine.line.length, sectionStart: node.headingLine.start }],
    });
    for (const c of node.chunks) {
      all.push(c);
      if (c.body !== "") parts.push(bodyPart(c));
    }
    for (const child of node.children.values()) collect(child, parts, all);
  };

  const assemble = (key: string, heading: string | null, parts: Part[], chunks: Chunk[]): OrganizedGroup => {
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
    return {
      key,
      heading,
      content: texts.join(JOINER),
      chunkCount: chunks.length,
      ranges,
      sources: chunks.map((c) => ({ sectionKey: c.sectionKey, start: c.start, end: c.end })),
    };
  };

  const groups = [...roots.values()].map((node) => {
    const parts: Part[] = [];
    const all: Chunk[] = [];
    collect(node, parts, all);
    return assemble(`h:${node.text}`, node.text, parts, all);
  });
  if (noHeading.length > 0)
    groups.push(
      assemble(
        "none",
        null,
        noHeading.filter((c) => c.body !== "").map(bodyPart),
        noHeading,
      ),
    );
  return groups;
}

/**
 * まとめの削除 (OrganizedView の削除ボタン) 用に、元セクションの content から
 * まとめに含めた範囲 (sources のうちそのセクションの分) を取り除いた残りを返す。
 * 範囲は見出し行の頭から次の見出し行の直前までなので、残った部分はそのままつながる。
 * 末尾に掛かる削除では、消した部分との区切りだった終端の空白も落とす
 */
export function cutRanges(content: string, ranges: { start: number; end: number }[]): string {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let out = "";
  let pos = 0;
  for (const r of sorted) {
    out += content.slice(pos, Math.max(pos, r.start));
    pos = Math.max(pos, r.end);
  }
  out += content.slice(pos);
  return pos >= content.length ? out.replace(/\s+$/, "") : out;
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
