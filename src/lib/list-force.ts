import {
  type Annotation,
  type ChangeDesc,
  ChangeSet,
  EditorSelection,
  EditorState,
  type Extension,
  type SelectionRange,
  type Text,
  Transaction,
} from "@codemirror/state";
import { type Command, EditorView } from "@codemirror/view";
import { cursorOf } from "@/lib/list-continue";
import { dedentChange } from "@/lib/list-indent";
import { HEADING_RE, LIST_ITEM_RE, LIST_MARKER_SOURCE } from "@/lib/markdown-syntax";

/**
 * 本文を常に箇条書きに保つ (#40)。
 * 入力・削除・ペーストで触れた行が項目の形 (`- ` など。LIST_ITEM_RE) でなくなっていたら、
 * インデントの後ろに `- ` を足して項目に戻す。空行 (セクション区切りの素材) と
 * 見出し (`# ` など。見出しは箇条書きにしない) は触らない。
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
        // IME 経由の # / ＃ の確定は見出しの書き出しに正規化する (#46)。スマホの IME は半角 # も
        // composition を通る (inputHandler の hashStartsHeading に届かない) ので、全角だけでなく
        // 半角も対象。userEvent 付きの dispatch なので、結果が見出しの形でなければ上の
        // transactionFilter が `- ` を足す (物理キーボードの半角入力と同じ扱い)
        const hashFix = hashHeadingFix(line.text, line.from);
        if (hashFix) {
          view.dispatch({ ...hashFix, scrollIntoView: true, userEvent: "input" });
          return;
        }
        const fix = markerFor(line.text, line.from);
        if (fix) view.dispatch({ changes: fix, userEvent: "input" });
      });
    },
  }),
];

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
 * 本文は常に箇条書きで、空の項目の Enter はセクション区切りになるため、これが箇条書きの
 * 途中に見出しを書く唯一の入り口 (Enter で空の項目を作って `#`)。
 * インデントも消すのは、見出しは階層に属さない (インデントしても表示は同じ見出しになるだけ) ため。
 * スペースのインデント (spaceIndentsListItem) と同じく、仮想キーボード対応で inputHandler にする。
 * 続けて `#` を足して h2..h6 にするのは普通の入力で足りる (見出しの行は forceListMarkers が触らない)。
 * 全角 ＃ も同じ扱いで半角にする (#46)。IME の変換 (composition) を経る ＃ はここに届かないので、
 * そちらは forceListMarkers の compositionend (hashHeadingFix) が拾う
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

/** 行が項目の形でなければ、インデントの直後に `- ` を挿す変更 (空行・見出し・項目の行は null) */
function markerFor(text: string, from: number): { from: number; insert: string } | null {
  if (/^[ \t]*$/.test(text) || HEADING_RE.test(text) || LIST_ITEM_RE.test(text)) return null;
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
  const head = cursorOf(view);
  if (head === null) return false;
  const { state } = view;
  const line = state.doc.lineAt(head);
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
  if (line.number === 1) {
    if (line.text.slice(m[0].length).trim() === "")
      view.dispatch({
        changes: { from: line.from, to: line.to },
        scrollIntoView: true,
        userEvent: "delete",
      });
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
