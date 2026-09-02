import { insertNewline } from "@codemirror/commands";
import type { Command } from "@codemirror/view";

// 箇条書きの項目の行頭: インデント + 記号 (`-` / `+` / `*` / `1.` / `1)`) + 空白。
// MarkdownView (micromark) が項目と見なす形と揃えている (記号の後に空白が必要)
const LIST_ITEM_RE = /^([ \t]*)([-+*]|\d+[.)])([ \t]+)/;

/**
 * Enter で箇条書きを同じ階層で続ける。
 * - 項目の途中 (記号より後ろ) で Enter → 同じインデント + 同じ記号 (番号付きは +1) を次の行に足す
 * - 記号だけの空の項目で Enter → 記号を消してリストを抜ける (Enter 連打で書き終われる)
 * - それ以外 (リスト外・記号より前・選択あり・IME 変換中) → 普通の改行 (insertNewline)
 * Shift+Enter は SectionEditor が insertNewline のままにしているので、項目の中で
 * 続きの行を書きたいときの逃げ道になる
 */
export const insertNewlineContinueList: Command = (view) => {
  const { state } = view;
  const sel = state.selection.main;
  if (view.composing || !sel.empty || state.selection.ranges.length > 1) return insertNewline(view);
  const line = state.doc.lineAt(sel.head);
  const m = LIST_ITEM_RE.exec(line.text);
  if (!m) return insertNewline(view);
  const markerEnd = line.from + m[0].length;
  // インデントや記号の途中にカーソルがあるときは項目の継続にしない
  if (sel.head < markerEnd) return insertNewline(view);
  if (!line.text.slice(m[0].length).trim()) {
    // 空の項目: 行ごと空にしてリストを抜ける
    view.dispatch({ changes: { from: line.from, to: line.to, insert: "" }, userEvent: "delete" });
    return true;
  }
  const ordered = /^(\d+)([.)])$/.exec(m[2]);
  const marker = ordered ? `${Number(ordered[1]) + 1}${ordered[2]}` : m[2];
  view.dispatch(
    state.update(state.replaceSelection(state.lineBreak + m[1] + marker + m[3]), {
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};
