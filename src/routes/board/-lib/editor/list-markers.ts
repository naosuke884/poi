import { EditorSelection, type Extension, type SelectionRange } from "@codemirror/state";
import { type Command, EditorView } from "@codemirror/view";

import { LIST_ITEM_RE, LIST_MARKER_SOURCE } from "../markdown/markdown-syntax";
import { cursorOf } from "./list-continue";
import { dedentChange } from "./list-indent";

/**
 * IME で確定した # / ＃ を見出しの書き出しに直す (#46)。スマホの IME は半角 # も composition を通り
 * inputHandler (hashStartsHeading / spaceAfterHashStartsHeading) に届かないので、確定後にここで拾う。
 * dispatch 中ではないが、CodeMirror 自身の確定処理と重ならないよう 1 拍置く
 */
export const imeHashStartsHeading: Extension = EditorView.domEventHandlers({
  compositionend(_event, view) {
    setTimeout(() => {
      if (view.composing) return;
      const line = view.state.doc.lineAt(view.state.selection.main.head);
      const hashFix = hashHeadingFix(line.text, line.from);
      if (hashFix) view.dispatch({ ...hashFix, scrollIntoView: true, userEvent: "input" });
    });
  },
});

// 記号だけの空の項目に # / ＃ だけが続く形 (IME で # を確定した直後)
const EMPTY_ITEM_HASH_RE = new RegExp(String.raw`^[ \t]*(?:${LIST_MARKER_SOURCE})[ \t]+([#＃]+)$`);
// 項目の本文が # / ＃ の並び (1〜6 個) + 空白で始まる形 (# の直後に後からスペースを入れた直後)
const ITEM_HASH_SPACE_RE = new RegExp(
  String.raw`^[ \t]*(?:${LIST_MARKER_SOURCE})[ \t]+([#＃]{1,6})(?![#＃])[ \t　]`,
);
// 行が # / ＃ の並びだけの形 (見出しの ＃ を書き足している途中)
const HASH_RUN_RE = /^( {0,3})([#＃]+)$/;

/**
 * IME で確定した # / ＃ を見出しの書き出しに直す変更 (#46, #55)。対象は 3 つ:
 * - 空の項目に # / ＃ だけ → hashStartsHeading と同じく記号とインデントを消して見出しの書き出しにする
 * - 項目の本文が # / ＃ の並び + 空白で始まる (# の直後に後からスペースを入れた) →
 *   spaceAfterHashStartsHeading と同じく記号とインデントを消して見出しにする (本文はそのまま、
 *   カーソルは変更に合わせて動かすだけなので selection は返さない)
 * - 行が # / ＃ の並びだけで全角を含む (h2..h6 へ書き足す途中) → ＃ を半角に揃える
 * それ以外 (# の後ろに空白を挟まず本文があるなど) は触らない (普通の文中の # まで変えないため)
 */
function hashHeadingFix(
  text: string,
  from: number,
): { changes: { from: number; to: number; insert: string }; selection?: SelectionRange } | null {
  const item = EMPTY_ITEM_HASH_RE.exec(text);
  if (item) {
    const hashes = "#".repeat(item[1]!.length);
    return {
      changes: { from, to: from + text.length, insert: hashes },
      selection: EditorSelection.cursor(from + hashes.length),
    };
  }
  const space = ITEM_HASH_SPACE_RE.exec(text);
  if (space) {
    return {
      changes: { from, to: from + space[0].length, insert: `${"#".repeat(space[1]!.length)} ` },
    };
  }
  const run = HASH_RUN_RE.exec(text);
  if (run && run[2]!.includes("＃")) {
    const indent = run[1]!.length;
    const hashes = "#".repeat(run[2]!.length);
    return {
      changes: { from: from + indent, to: from + text.length, insert: hashes },
      selection: EditorSelection.cursor(from + indent + hashes.length),
    };
  }
  return null;
}

/**
 * 空の項目で `#` を打ったら、記号 (とインデント) を消して見出しの書き出しにする。
 * 箇条書きの途中で見出しを書くときの近道 (Enter で空の項目を作って `#`。リストを抜けてから `#` と同じ結果)。
 * インデントも消すのは、見出しは階層に属さない (インデントしても表示は同じ見出しになるだけ) ため。
 * スペースのインデント (spaceIndentsListItem) と同じく、仮想キーボード対応で inputHandler にする。
 * 続けて `#` を足して h2..h6 にするのは普通の入力で足りる。
 * 全角 ＃ も同じ扱いで半角にする (#46)。IME の変換 (composition) を経る ＃ はここに届かないので、
 * そちらは imeHashStartsHeading が拾う
 */
export const hashStartsHeading = EditorView.inputHandler.of((view, from, to, text) => {
  if ((text !== "#" && text !== "＃") || from !== to) return false;
  const { state } = view;
  if (cursorOf(view) !== from) return false;
  const line = state.doc.lineAt(from);
  const m = LIST_ITEM_RE.exec(line.text);
  // 記号だけの空の項目で、カーソルが本文の先頭 (= 行末) にあるときだけ
  if (!m || m[0].length !== line.length || from !== line.to) return false;
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: "#" },
    selection: EditorSelection.cursor(line.from + 1),
    scrollIntoView: true,
    userEvent: "input.type",
  });
  return true;
});

/**
 * `#` の直後に後からスペースを入れたときも見出しにする (#55)。
 * `#foo` と続けて書いた項目 (`- #foo`) は hashStartsHeading を通らず箇条書きに残るが、
 * `#` と本文の間にカーソルを戻してスペースを打ったら `# ` の形になるので、そのときも
 * 記号とインデントを消して見出しにする (見出しは階層に属さないのも hashStartsHeading と同じ)。
 * 対象は本文が `#` の並び (1〜6 個) で始まり、カーソルがその並びの直後にあるときだけ
 * (並びの途中や、7 個以上でそもそも見出しにならない形は普通のスペースとして通す)。
 * 全角 ＃ と全角スペースも同じ扱いで半角にする (#46 と同じくスマホの IME 対応)
 */
export const spaceAfterHashStartsHeading = EditorView.inputHandler.of((view, from, to, text) => {
  if ((text !== " " && text !== "　") || from !== to) return false;
  const { state } = view;
  if (cursorOf(view) !== from) return false;
  const line = state.doc.lineAt(from);
  const m = LIST_ITEM_RE.exec(line.text);
  if (!m) return false;
  const run = /^[#＃]{1,6}(?![#＃])/.exec(line.text.slice(m[0].length));
  if (!run || from !== line.from + m[0].length + run[0].length) return false;
  const heading = `${"#".repeat(run[0].length)} `;
  view.dispatch({
    changes: { from: line.from, to: from, insert: heading },
    selection: EditorSelection.cursor(line.from + heading.length),
    scrollIntoView: true,
    userEvent: "input.type",
  });
  return true;
});

/**
 * 項目の記号より左 (行頭〜本文の先頭) での Backspace。記号を 1 文字ずつ削らず、まとめて扱う:
 * - インデントがあれば 1 段戻す (Shift+Tab と同じ)
 * - なければ記号を消して普通の行に戻す (本文はそのまま。もう一度 Backspace で前の行と結合する)
 * doc の先頭 (セクションの結合。SectionEditor が Board に渡す) と記号より右では false (通常の 1 文字削除に任せる)
 */
export const deleteListMarkerBackward: Command = (view) => {
  const head = cursorOf(view);
  if (head === null) return false;
  const line = view.state.doc.lineAt(head);
  const m = LIST_ITEM_RE.exec(line.text);
  if (!m) return false;
  const markerEnd = line.from + m[0].length;
  if (head === 0 || head > markerEnd) return false;
  if (m[1]!.length > 0) {
    view.dispatch({
      changes: dedentChange(line)!,
      scrollIntoView: true,
      userEvent: "delete.dedent",
    });
    return true;
  }
  view.dispatch({
    changes: { from: line.from, to: markerEnd },
    selection: EditorSelection.cursor(line.from),
    scrollIntoView: true,
    userEvent: "delete",
  });
  return true;
};

/**
 * 行末での Delete で次の行が項目のとき、改行と記号をまとめて消して中身だけを引き上げる
 * (改行だけ消すと記号が本文の途中に残る)。
 * それ以外は false (通常の削除に任せる)
 */
export const deleteListMarkerForward: Command = (view) => {
  const head = cursorOf(view);
  if (head === null) return false;
  const { state } = view;
  const line = state.doc.lineAt(head);
  if (head !== line.to || line.number === state.doc.lines) return false;
  const next = state.doc.line(line.number + 1);
  const m = LIST_ITEM_RE.exec(next.text);
  if (!m) return false;
  view.dispatch({
    changes: { from: line.to, to: next.from + m[0].length },
    scrollIntoView: true,
    userEvent: "delete",
  });
  return true;
};
