import {
  type Annotation,
  type ChangeDesc,
  ChangeSet,
  EditorSelection,
  EditorState,
  type Extension,
  type Text,
  Transaction,
} from "@codemirror/state";
import { type Command, EditorView } from "@codemirror/view";
import { LIST_ITEM_RE } from "@/lib/list-continue";

/**
 * 本文を常に箇条書きに保つ (#40)。
 * 入力・削除・ペーストで触れた行が項目の形 (`- ` など。LIST_ITEM_RE) でなくなっていたら、
 * インデントの後ろに `- ` を足して項目に戻す。空行 (セクション区切りの素材) は触らない。
 * 既存の項目でない行も、編集で触れた時点で項目になる (触るまではそのまま)。
 * 取り消し (undo) や Board からの同期 (分割 / 結合) は対象外: userEvent の付いた編集だけ直す。
 * 直しは元の編集と 1 つのトランザクションに合成する (undo で一緒に戻る)。spec を配列で足すと
 * 元の doc の座標で解釈されて挿入の順序を制御できないので、changes を自分で compose して
 * 丸ごと置き換える。annotation は作り直すと消えるので、poi が使うものだけ引き継ぐ
 */
export const forceListMarkers: Extension = [
  EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || !(tr.isUserEvent("input") || tr.isUserEvent("delete"))) return tr;
    // IME 変換中に行頭へ挿入すると変換が壊れるので触らない (変換確定後の compositionend で拾う)
    if (tr.isUserEvent("input.type.compose")) return tr;
    const fixes = missingMarkers(tr.newDoc, tr.changes);
    if (fixes.length === 0) return tr;
    const fixSet = ChangeSet.of(fixes, tr.newDoc.length);
    const annotations: Annotation<unknown>[] = [];
    const time = tr.annotation(Transaction.time);
    if (time !== undefined) annotations.push(Transaction.time.of(time));
    const userEvent = tr.annotation(Transaction.userEvent);
    if (userEvent !== undefined) annotations.push(Transaction.userEvent.of(userEvent));
    const addToHistory = tr.annotation(Transaction.addToHistory);
    if (addToHistory !== undefined) annotations.push(Transaction.addToHistory.of(addToHistory));
    return {
      changes: tr.changes.compose(fixSet),
      selection: tr.newSelection.map(fixSet),
      effects: tr.effects,
      annotations,
      scrollIntoView: tr.scrollIntoView,
    };
  }),
  // IME で確定した行の分の直し。dispatch 中ではないが、CodeMirror 自身の確定処理と重ならないよう 1 拍置く
  EditorView.domEventHandlers({
    compositionend(_event, view) {
      setTimeout(() => {
        if (view.composing) return;
        const line = view.state.doc.lineAt(view.state.selection.main.head);
        const fix = markerFor(line.text, line.from);
        if (fix) view.dispatch({ changes: fix, userEvent: "input" });
      });
    },
  }),
];

/** 行が項目の形でなければ、インデントの直後に `- ` を挿す変更 (空行と項目の行は null) */
function markerFor(text: string, from: number): { from: number; insert: string } | null {
  if (/^[ \t]*$/.test(text) || LIST_ITEM_RE.test(text)) return null;
  return { from: from + /^[ \t]*/.exec(text)![0].length, insert: "- " };
}

/** 変更が触れた行のうち、項目の形に直すべきものへの挿入 (新しい doc の座標) */
function missingMarkers(doc: Text, changes: ChangeDesc): { from: number; insert: string }[] {
  const fixes: { from: number; insert: string }[] = [];
  const seen = new Set<number>();
  changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    for (let n = doc.lineAt(fromB).number; n <= doc.lineAt(toB).number; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const line = doc.line(n);
      const fix = markerFor(line.text, line.from);
      if (fix) fixes.push(fix);
    }
  });
  return fixes;
}

/**
 * 項目の記号より左 (行頭〜本文の先頭) での Backspace。
 * 1 文字ずつ消すと記号が壊れて forceListMarkers が `- ` を足し直してしまうので、まとめて扱う:
 * - インデントがあれば 1 段戻す (Shift+Tab と同じ)
 * - 最初の行では、中身が空なら記号ごと消して空のセクションに戻す。中身があれば何もしない
 *   (セクションの結合は行頭 = doc の先頭での Backspace。SectionEditor が Board に渡す)
 * - それ以外は前の行の末尾に結合する (改行と記号をまとめて消す)
 * 記号より右では false (通常の 1 文字削除に任せる)
 */
export const deleteListMarkerBackward: Command = (view) => {
  if (view.composing) return false;
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty || state.selection.ranges.length > 1) return false;
  const line = state.doc.lineAt(sel.head);
  const m = LIST_ITEM_RE.exec(line.text);
  if (!m) return false;
  const markerEnd = line.from + m[0].length;
  if (sel.head === 0 || sel.head > markerEnd) return false;
  if (m[1]!.length > 0) {
    // list-indent の indentLess と同じ 1 段分
    const step = /^(?: {0,3}\t| {1,4})/.exec(line.text)!;
    view.dispatch({
      changes: { from: line.from, to: line.from + step[0].length },
      scrollIntoView: true,
      userEvent: "delete.dedent",
    });
    return true;
  }
  if (line.number === 1) {
    if (line.text.slice(m[0].length).trim() === "")
      view.dispatch({ changes: { from: line.from, to: line.to }, scrollIntoView: true, userEvent: "delete" });
    return true;
  }
  const prev = state.doc.line(line.number - 1);
  view.dispatch({
    changes: { from: prev.to, to: markerEnd },
    selection: EditorSelection.cursor(prev.to),
    scrollIntoView: true,
    userEvent: "delete",
  });
  return true;
};

/**
 * 行末での Delete で次の行が項目のとき、改行と記号をまとめて消して中身だけを引き上げる
 * (Backspace の結合の鏡写し。改行だけ消すと記号が本文の途中に残る)。
 * それ以外は false (通常の削除に任せる)
 */
export const deleteListMarkerForward: Command = (view) => {
  if (view.composing) return false;
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty || state.selection.ranges.length > 1) return false;
  const line = state.doc.lineAt(sel.head);
  if (sel.head !== line.to || line.number === state.doc.lines) return false;
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
