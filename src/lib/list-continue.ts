import { insertNewline } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import type { Command } from "@codemirror/view";

// 箇条書きの項目の行頭: インデント + 記号 (`-` / `+` / `*` / `1.` / `1)`) + 空白。
// MarkdownView (micromark) が項目と見なす形と揃えている (記号の後に空白が必要。
// 番号は CommonMark と同じ 9 桁まで: 10 桁以上の数字で始まる行はリストではなくただの文)
export const LIST_ITEM_RE = /^([ \t]*)([-+*]|\d{1,9}[.)])([ \t]+)/;

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
  const sel = state.selection.main;
  if (view.composing || !sel.empty || state.selection.ranges.length > 1) return insertNewline(view);
  const line = state.doc.lineAt(sel.head);
  const m = LIST_ITEM_RE.exec(line.text);
  if (!m) return insertNewline(view);
  const markerEnd = line.from + m[0].length;
  // インデントや記号の途中にカーソルがあるときは項目の継続にしない
  if (sel.head < markerEnd) return insertNewline(view);
  if (!line.text.slice(m[0].length).trim()) {
    if (m[1]!.length > 0) {
      // 空の項目でインデントがあれば 1 段戻す (list-indent の indentLess と同じ 1 段分)
      const step = /^(?: {0,3}\t| {1,4})/.exec(line.text)!;
      view.dispatch({
        changes: { from: line.from, to: line.from + step[0].length },
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
