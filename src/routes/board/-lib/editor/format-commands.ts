import type { Command, EditorView } from "@codemirror/view";

import { LIST_MARKER_SOURCE } from "../markdown/markdown-syntax";
import { coveredLines, indentColumns } from "./list-indent";

// 書式のツールバー (SectionToolbar) のボタンが実行するコマンド。キーボードなら記号を打てば済むが、
// スマホでは # や - や Tab を打ちにくいので、押すだけで行の頭の記号を付け替えられるようにする。
// どれもカーソルのある行 (選択していれば、選択が触れている行すべて) に効く

/**
 * 行の頭の記号 (インデント・見出しの # 列・箇条書きの記号) の範囲。
 * 箇条書きの記号は LIST_MARKER_SOURCE から作る (Enter / Tab の編集コマンドや表示と同じ記号だけを記号と見なす)。
 * # だけの行も見出し (表示と同じ。markdown-syntax の HEADING_RE)
 */
const PREFIX_RE = new RegExp(
  String.raw`^([ \t]*)(#{1,6}(?:[ \t]+|$)|(?:${LIST_MARKER_SOURCE})[ \t]+)?`,
);
const HEADING_PREFIX_RE = /^#{1,6}[ \t]*$/;
const BULLET_PREFIX_RE = /^[-+*][ \t]+$/;
const ORDERED_PREFIX_RE = /^\d{1,9}[.)][ \t]+$/;

/**
 * 書式を付ける行: カーソル / 選択が触れている行のうち、空でない行。全部が空なら (空の行にカーソルを置いて押した)、その行。
 * 選択の途中の空行に記号を付けると、空の項目ができて番号もずれ、もう一度押しても外せなくなる (空行は記号の形に合わないため)
 */
function targetLines(view: EditorView) {
  const lines = coveredLines(view);
  const filled = lines.filter((line) => line.text.trim() !== "");
  return filled.length > 0 ? filled : lines;
}

/**
 * 行の頭の記号を付け替える。prefixFor は各行の今の記号 (インデントの後ろの部分) を見て、新しい頭 (インデントを含む) を返す。
 * カーソルは本文の同じ位置に残す (記号の前に置き去りにしない)
 */
function replacePrefixes(
  view: EditorView,
  prefixFor: (line: { indent: string; marker: string }) => string,
): boolean {
  if (view.composing) return true;
  const { state } = view;
  const lines = targetLines(view);
  const changes = state.changes(
    lines.map((line) => {
      const m = PREFIX_RE.exec(line.text)!;
      const [whole, indent = "", marker = ""] = m;
      return {
        from: line.from,
        to: line.from + whole.length,
        insert: prefixFor({ indent, marker }),
      };
    }),
  );
  view.dispatch({
    changes,
    selection: state.selection.map(changes, 1),
    scrollIntoView: true,
    userEvent: "input.format",
  });
  return true;
}

/**
 * 見出しにする (level は # の数)。触れている行がどれもその大きさの見出しなら、見出しをやめる。
 * 見出しにする行の箇条書きの記号とインデントは外す (見出しは行頭に書く)
 */
export function toggleHeading(level: number): Command {
  const mark = `${"#".repeat(level)} `;
  return (view) => {
    const lines = targetLines(view);
    const already = lines.every((line) => {
      const marker = PREFIX_RE.exec(line.text)![2] ?? "";
      return marker.trimEnd() === mark.trimEnd();
    });
    return replacePrefixes(view, () => (already ? "" : mark));
  };
}

/**
 * 箇条書き (bullet は `- `、ordered は `1. ` から順に) にする。触れている行がどれもその種類の箇条書きなら、記号を外す。
 * インデント (階層) は残し、見出しの # は外す
 */
export function toggleList(kind: "bullet" | "ordered"): Command {
  const re = kind === "bullet" ? BULLET_PREFIX_RE : ORDERED_PREFIX_RE;
  return (view) => {
    const lines = targetLines(view);
    const already = lines.every((line) => re.test(PREFIX_RE.exec(line.text)![2] ?? ""));
    // 番号は階層 (インデントの桁。タブと空白が混ざっていても) ごとに数える。浅い階層に戻ったら、それより深い階層は数え直す
    const counts: { columns: number; n: number }[] = [];
    return replacePrefixes(view, ({ indent, marker }) => {
      // 見出しはインデントしないので、見出しから箇条書きにするときはインデントも無し
      const keep = HEADING_PREFIX_RE.test(marker) ? "" : indent;
      if (already) return keep;
      if (kind === "bullet") return `${keep}- `;
      const columns = indentColumns(keep);
      while (counts.length > 0 && counts.at(-1)!.columns > columns) counts.pop();
      const level = counts.at(-1);
      if (level?.columns === columns) level.n++;
      else counts.push({ columns, n: 1 });
      return `${keep}${counts.at(-1)!.n}. `;
    });
  };
}
