import type { Line, Text } from "@codemirror/state";
import type { Command, EditorView } from "@codemirror/view";
import { LIST_ITEM_RE } from "@/lib/list-continue";

/**
 * Tab / Shift+Tab のインデント操作。
 * どちらも (何も変えなくても) true を返してキーを飲み込む: ブラウザ既定の Tab (次の要素へ) に任せると、
 * 最後のセクションではフォーカスがページの外 (ブラウザの UI) へ抜けて、Board の onBlur が編集中のまま
 * 残してしまうため。編集をやめるのは Esc (SectionEditor)。
 *
 * インデントはタブ 1 つ。タブは CommonMark では次の 4 桁区切りまでと数えるので、`1.` など幅 3 の記号の
 * 項目の下でも 1 回で子の階層に入る (スペース 2 つだと `- ` の下でしか足りない)。
 * インデントコードブロックは無効 (BOARD_MARKDOWN_DISABLED / section-markdown.ts の remove) なので、
 * 深くしすぎてもコードにはならない
 */

// CommonMark のタブ幅 (タブは次の 4 桁区切りまで進む)
const TAB_WIDTH = 4;

/** 行頭の空白 (インデント) の桁数。startCol から数え始める */
function indentColumns(indent: string, startCol = 0): number {
  let col = startCol;
  for (const ch of indent) col += ch === "\t" ? TAB_WIDTH - (col % TAB_WIDTH) : 1;
  return col;
}

/** 選択 (複数可) が触れている行を重複なく上から順に */
function coveredLines(view: EditorView): Line[] {
  const { doc } = view.state;
  const lines = new Map<number, Line>();
  for (const range of view.state.selection.ranges) {
    for (let pos = range.from; ; ) {
      const line = doc.lineAt(pos);
      lines.set(line.number, line);
      if (line.to >= range.to) break;
      pos = line.to + 1;
    }
  }
  return [...lines.values()].sort((a, b) => a.from - b.from);
}

/**
 * インデント後の番号付き項目に与える番号 (番号付きでなければ null)。
 * CommonMark では段落 (親項目の本文) を中断して新しいリストを始められる番号付き項目は 1 始まりだけなので、
 * 番号をそのままインデントすると (`1. a` の次の `2. b` を Tab した場合など) MarkdownView では入れ子に
 * ならず本文の続きになってしまう。上の行を遡って、インデント後に同じ深さになる兄弟が居ればその次の番号、
 * 親の項目や本文の途中なら (= 段落を中断する新しいサブリストの先頭) 1 にする。
 * 文頭や空行の後は中断する段落が無く任意の番号で始められるので触らない (`2021. できごと` のような
 * 番号をユーザーの内容として保つ)。
 * 同時にインデントする行 (indented) は足されるタブを織り込んだ桁で比べ、既に決めた番号 (assigned) から続ける
 */
function renumberFor(
  doc: Text,
  line: Line,
  indented: ReadonlySet<number>,
  assigned: Map<number, number>,
): { from: number; to: number; insert: string } | null {
  const m = LIST_ITEM_RE.exec(line.text);
  const ordered = m && /^\d+[.)]$/.test(m[2]!);
  if (!m || !ordered) return null;
  const newCol = indentColumns(m[1]!, TAB_WIDTH); // 行頭にタブが 1 つ足された後の桁
  if (line.number === 1) return null; // 文頭: 中断する段落が無いので番号はそのまま
  let want = 1;
  for (let n = line.number - 1; n >= 1; n--) {
    const prevLine = doc.line(n).text;
    if (/^[ \t]*$/.test(prevLine)) return null; // 空行の後: 同上 (どの番号からでも新しいリストを始められる)
    const prev = LIST_ITEM_RE.exec(prevLine);
    // 項目でない行 (本文の段落や項目の続きの行) の後: 段落を中断するには 1 始まりが要る
    if (!prev) break;
    const col = indentColumns(prev[1]!, indented.has(n) ? TAB_WIDTH : 0);
    if (col > newCol) continue; // より深い項目 (前のサブリスト) は飛ばす
    if (col === newCol) {
      // 同じ深さの兄弟。番号付きならその次、bullet なら新しい番号付きリストの先頭 (1)
      const num = /^(\d+)[.)]$/.exec(prev[2]!);
      if (num) want = (assigned.get(n) ?? Number(num[1])) + 1;
    }
    break; // col < newCol は親 → 自分が最初の子 (1 のまま)
  }
  assigned.set(line.number, want);
  const numFrom = line.from + m[1]!.length;
  const numTo = numFrom + m[2]!.length - 1; // 末尾の `.` / `)` は残す
  if (doc.sliceString(numFrom, numTo) === String(want)) return null;
  return { from: numFrom, to: numTo, insert: String(want) };
}

/**
 * Tab: 箇条書きの項目の行 (カーソルが行のどこにあっても) は行頭にタブを足して階層を下げる。
 * 選択があれば触れている行をまとめて下げる。それ以外はカーソル位置にタブを挿す。
 * 番号付き項目は必要なら番号を振り直す (renumberFor)。
 * IME 変換中は何もしない (Tab は変換候補の操作。キーだけ飲み込む)
 */
export const indentMoreOrInsertTab: Command = (view) => {
  if (view.composing) return true;
  const { state } = view;
  const sel = state.selection.main;
  const hasSelection = state.selection.ranges.some((r) => !r.empty);
  if (!hasSelection && !LIST_ITEM_RE.test(state.doc.lineAt(sel.head).text)) {
    view.dispatch(state.update(state.replaceSelection("\t"), { scrollIntoView: true, userEvent: "input" }));
    return true;
  }
  const lines = coveredLines(view);
  const indented = new Set(lines.map((l) => l.number));
  const assigned = new Map<number, number>();
  view.dispatch({
    changes: lines.flatMap((line) => {
      const renumber = renumberFor(state.doc, line, indented, assigned);
      return [{ from: line.from, insert: "\t" }, ...(renumber ? [renumber] : [])];
    }),
    scrollIntoView: true,
    userEvent: "input.indent",
  });
  return true;
};

/**
 * Shift+Tab: 触れている行の行頭からタブ 1 つ分 (タブ停止 1 つ = スペース最大 4 つ。` \t` のような
 * 混在も 1 停止分まとめて) を消して階層を戻す。手で入れたスペース 2 つのインデントもこれで戻せる。
 * 番号は触らない (同じリストに続く項目の番号は何でもよく、表示は自動で振られる)。
 * 空のセクションでは既定に落とす (Shift+Tab で前の要素へフォーカスが戻れるように。
 * それ以外では消すものが無くても飲み込む)
 */
export const indentLess: Command = (view) => {
  if (view.composing) return true;
  if (view.state.doc.length === 0) return false;
  const changes = coveredLines(view).flatMap((line) => {
    const m = /^(?: {0,3}\t| {1,4})/.exec(line.text);
    return m ? [{ from: line.from, to: line.from + m[0].length }] : [];
  });
  if (changes.length > 0) view.dispatch({ changes, scrollIntoView: true, userEvent: "delete.dedent" });
  return true;
};
