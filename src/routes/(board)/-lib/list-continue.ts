import { insertNewline } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import type { Command, EditorView } from "@codemirror/view";
import { dedentChange } from "./list-indent";
import { LIST_ITEM_RE } from "./markdown-syntax";

/** 選択が無い (カーソルだけ) なら head。IME 変換中・選択あり・複数カーソルは null */
export function cursorOf(view: EditorView): number | null {
  const sel = view.state.selection.main;
  if (view.composing || !sel.empty || view.state.selection.ranges.length > 1) return null;
  return sel.head;
}

/**
 * Enter で箇条書きを同じ階層で続ける。
 * - 項目の途中 (記号より後ろ) で Enter → 同じインデント + 同じ記号 (番号付きは +1) を次の行に足す
 * - 空の項目で Enter → インデントがあれば 1 段戻す。いちばん外の空の項目なら行をセクション区切り
 *   (空行 2 つ。Board の splitAtSeparator が拾う) にして、新しいセクションで書き続けられるようにする
 *   (本文は常に箇条書きなのでリストからは抜けない。Enter 連打で次のセクションへ、の流れは保つ)
 * - それ以外 (リスト外・記号より前・選択あり・IME 変換中) → 普通の改行 (insertNewline)
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
      view.dispatch({
        changes: dedentChange(line)!,
        userEvent: "delete.dedent",
      });
      return true;
    }
    // セクションがこの空の項目だけなら何もしない (空のセクションを増やしても仕方がない)
    if (state.doc.lines === 1) return true;
    // 行を丸ごと区切りにする。前の (または次の) 行との間の改行と合わせて空行 2 つ = SECTION_SEPARATOR になる。
    // カーソルは次のセクションの先頭に相当する位置へ (Board が focus を計算し直す)
    const first = line.number === 1;
    const insert = first ? "\n\n\n" : "\n\n";
    const to = line.number === state.doc.lines ? line.to : line.to + 1;
    view.dispatch({
      changes: { from: line.from, to, insert },
      selection: EditorSelection.cursor(line.from + insert.length),
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
