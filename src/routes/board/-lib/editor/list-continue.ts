import { insertNewline } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import type { Command, EditorView } from "@codemirror/view";
import { LIST_ITEM_RE } from "../markdown/markdown-syntax";
import { dedentChange } from "./list-indent";

/** 選択が無い (カーソルだけ) なら head。IME 変換中・選択あり・複数カーソルは null */
export function cursorOf(view: EditorView): number | null {
  const sel = view.state.selection.main;
  if (view.composing || !sel.empty || view.state.selection.ranges.length > 1) return null;
  return sel.head;
}

/**
 * Enter で箇条書きを同じ階層で続ける。
 * - 項目の途中 (記号より後ろ) で Enter → 同じインデント + 同じ記号 (番号付きは +1) を次の行に足す
 * - 空の項目で Enter → インデントがあれば 1 段戻す。いちばん外なら記号を消し、空行を挟んでリストを抜ける
 *   (空行を挟まないと、次に書いた行が Markdown では前の項目の続きになる)。
 *   もう一度 Enter で空行 2 つ = セクション区切りになるので、Enter 連打で次のセクションへ進める
 * - それ以外 (リスト外・記号より前・選択あり・IME 変換中) → 普通の改行 (insertNewline)
 * Shift+Enter は SectionEditor が insertNewline のままにしているので、項目の中で
 * 続きの行を書きたいときの逃げ道になる
 */
export const insertNewlineContinueList: Command = (view) => {
  const { state } = view;
  const head = cursorOf(view);
  if (head === null) return insertNewline(view);
  const line = state.doc.lineAt(head);
  const m = LIST_ITEM_RE.exec(line.text);
  if (!m) return insertNewline(view);
  const markerEnd = line.from + m[0].length;
  // インデントや記号の途中にカーソルがあるときは項目の継続にしない
  if (head < markerEnd) return insertNewline(view);
  if (!line.text.slice(m[0].length).trim()) {
    if (m[1]!.length > 0) {
      // 空の項目でインデントがあれば 1 段戻す
      view.dispatch({ changes: dedentChange(line)!, userEvent: "delete.dedent" });
      return true;
    }
    // いちばん外の空の項目: 記号を消し、前の行が空でなければ空行を 1 つ挟んでリストを抜ける
    const blank = line.number > 1 && state.doc.line(line.number - 1).text.trim() !== "";
    const insert = blank ? state.lineBreak : "";
    view.dispatch({
      changes: { from: line.from, to: line.to, insert },
      selection: EditorSelection.cursor(line.from + insert.length),
      scrollIntoView: true,
      userEvent: "input",
    });
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
