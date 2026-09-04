import {
  history,
  historyKeymap,
  insertNewline,
  simplifySelection,
  standardKeymap,
  deleteCharBackwardStrict,
} from "@codemirror/commands";
import { Annotation, Compartment, EditorSelection, EditorState, Prec, Transaction } from "@codemirror/state";
import { EditorView, type KeyBinding, keymap, placeholder as placeholderExt } from "@codemirror/view";
import { type Ref, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { BOARD_MAX_LENGTH } from "../../worker/memo/constants";
import { insertNewlineContinueList } from "@/lib/list-continue";
import { indentLess, indentMoreOrInsertTab } from "@/lib/list-indent";
import { sectionMarkdown } from "@/lib/section-markdown";
import classes from "./SectionEditor.module.css";

export type SectionEditorHandle = {
  /** フォーカスしてカーソルを pos に置く (doc の長さで clamp)。カーソルが見えるように同期的にスクロールする */
  focus(pos: number): void;
};

type Props = {
  value: string;
  /** 入力。cursor は selection.main.head (Board が分割位置の判定に使う) */
  onChange(value: string, cursor: number): void;
  onFocus(): void;
  onBlur(): void;
  /** 先頭で Backspace (選択なし)。Board が前のセクションと結合する */
  onBackspaceAtStart(): void;
  /** 末尾で Delete (選択なし)。Board が次のセクションと結合する */
  onDeleteAtEnd(): void;
  /** 最初の (表示上の) 行で ↑。false を返せば通常の動き (移動先が無いとき) */
  onArrowUpAtFirstLine(): boolean;
  /** 最後の (表示上の) 行で ↓。false を返せば通常の動き */
  onArrowDownAtLastLine(): boolean;
  /** Esc で編集をやめた (blur 済み)。Board は Markdown 表示に切り替えてそこへフォーカスを移す */
  onEscape(): void;
  /** 複数行なら \n 区切り */
  placeholder?: string;
  readOnly?: boolean;
  "aria-label": string;
  ref?: Ref<SectionEditorHandle>;
};

// Board からの value の同期 (分割 / 結合 / 取り消し) で入れた変更の印。onChange で Board に戻さない・履歴に積まない・
// 文字数上限で弾かない (弾くと Board の state と doc が食い違う)
const externalSync = Annotation.define<boolean>();

// 表示上の同じ行かどうかの判定で許す top の誤差 (px)。同じ行の文字は同じ top になるが、サブピクセルの丸めを見込む
const SAME_ROW_TOLERANCE = 1;

/** フォーカスしてカーソルを pos (doc の長さで clamp) に置き、見えるようにスクロールする */
function applyFocus(view: EditorView, pos: number) {
  const at = Math.max(0, Math.min(pos, view.state.doc.length));
  view.focus();
  view.dispatch({ selection: EditorSelection.cursor(at), scrollIntoView: true });
  // scrollIntoView は次のフレーム (requestAnimationFrame の計測) で行われるので、ここで同期的に済ませる:
  // Board の「最後のセクションの冒頭を上端に出す」layout effect はこの直後に走り、カーソルへのスクロールを
  // 上書きする前提 (Textarea の focus() は同期的にスクロールしていた)。coordsAtPos などレイアウトを読む API は
  // 保留中の計測 (スクロールを含む) をその場で実行する (view.measure() は公開 API ではない)
  view.coordsAtPos(at);
}

/**
 * 編集中セクションのエディタ (CodeMirror 6)。Board が編集中の 1 セクションだけこれで表示する。
 * テキストは常に Markdown ソースそのもので、見出し・記号・URL は装飾するだけ (src/lib/section-markdown.ts)。
 * Textarea と同じ使い勝手にする: 散文向けの spellcheck / 自動大文字化、Enter は単純な改行、
 * 文字数上限、複数行のプレースホルダ。
 * セクションの境界 (先頭で Backspace / 末尾で Delete / 最初の行で ↑ / 最後の行で ↓) はキー処理を横取りして
 * Board のコールバックに渡す。Board 側は textarea の selectionStart などに依存しない。
 * Tab / Shift+Tab はインデント操作 (src/lib/list-indent.ts)、Esc は編集をやめる (blur)
 */
export function SectionEditor({
  value,
  onChange,
  onFocus,
  onBlur,
  onBackspaceAtStart,
  onDeleteAtEnd,
  onArrowUpAtFirstLine,
  onArrowDownAtLastLine,
  onEscape,
  placeholder,
  readOnly = false,
  "aria-label": ariaLabel,
  ref,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // 最後に頼まれたフォーカス位置。StrictMode (開発時のみ) は新しくマウントした layout effect を破棄→再実行するので、
  // Board がフォーカスした直後に view を作り直すことになる (Textarea は DOM が残るので困らなかった)。
  // 作り直した view にも同じフォーカスを引き継ぐ (blur で消す。作り直し時にしか使わない)
  const wantFocusRef = useRef<number | null>(null);
  // コールバックは最新の props を呼ぶ (拡張は一度作ったら作り直さない)
  const callbacksRef = useRef({
    onChange,
    onFocus,
    onBlur,
    onBackspaceAtStart,
    onDeleteAtEnd,
    onArrowUpAtFirstLine,
    onArrowDownAtLastLine,
    onEscape,
  });
  callbacksRef.current = {
    onChange,
    onFocus,
    onBlur,
    onBackspaceAtStart,
    onDeleteAtEnd,
    onArrowUpAtFirstLine,
    onArrowDownAtLastLine,
    onEscape,
  };
  // マウント後に変わりうる設定 (aria-label はセクション番号なので前が消えると変わる。placeholder は
  // セクションが 1 つのときだけ) は Compartment で差し替える
  const [configCompartment] = useState(() => new Compartment());
  const config = () =>
    [
      placeholder !== undefined ? placeholderExt(placeholder) : [],
      // CodeMirror の既定はコード向け (spellcheck off 等) なので、メモ (散文) 向けに Textarea と同じにする
      EditorView.contentAttributes.of({
        "aria-label": ariaLabel,
        spellcheck: "true",
        autocorrect: "on",
        autocapitalize: "sentences",
      }),
      readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [],
    ] as const;

  useImperativeHandle(
    ref,
    () => ({
      focus(pos) {
        wantFocusRef.current = pos;
        if (viewRef.current) applyFocus(viewRef.current, pos);
      },
    }),
    [],
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          configCompartment.of(config()),
          sectionMarkdown(),
          history(),
          Prec.highest(keymap.of(boundaryKeymap(callbacksRef))),
          keymap.of([...standardKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          // カーソルへのスクロール (window をスクロールする: .cm-scroller は overflow: visible) で、固定ヘッダーの
          // 下にカーソルが隠れないようにする。余白は Board が Box の scroll-margin-top に入れているものをそのまま
          // 使う (ヘッダーの高さ + 本文の余白。CSS 変数の calc をここで解くより、計算済みの値を読むほうが確実)
          EditorView.scrollMargins.of((view) => {
            const box = view.dom.closest("[data-section]");
            if (!box) return null;
            return { top: Number.parseFloat(getComputedStyle(box).scrollMarginTop) || 0 };
          }),
          // 文字数上限 (Textarea の maxLength 相当)。減る (または同じ長さの) 変更は常に通す: IME や結合で上限を
          // 超えた後に 1 文字ずつ消して戻れるように (textarea の maxLength も削除は弾かない)。
          // 増える変更でも IME の変換中は通す (弾くと変換が壊れる。超過分は保存時の検証と赤い文字数表示で分かる)
          EditorState.transactionFilter.of((tr) => {
            if (
              !tr.docChanged ||
              tr.newDoc.length <= BOARD_MAX_LENGTH ||
              tr.newDoc.length <= tr.startState.doc.length
            )
              return tr;
            if (tr.isUserEvent("input.type.compose") || tr.annotation(externalSync)) return tr;
            return [];
          }),
          EditorView.updateListener.of((update) => {
            const cb = callbacksRef.current;
            if (update.docChanged && !update.transactions.some((tr) => tr.annotation(externalSync))) {
              cb.onChange(update.state.doc.toString(), update.state.selection.main.head);
            }
            if (update.focusChanged) {
              if (update.view.hasFocus) cb.onFocus();
              else {
                wantFocusRef.current = null;
                cb.onBlur();
              }
            }
          }),
        ],
      }),
      parent: host,
    });
    viewRef.current = view;
    // StrictMode の作り直し (上記) でフォーカスが失われないように、頼まれていたフォーカスを新しい view に適用する
    if (wantFocusRef.current !== null) applyFocus(view, wantFocusRef.current);
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // マウント時に一度だけ作る。props の変化は下の effect と Compartment で反映する
  }, []);

  // value の同期。Board からの分割 / 結合 / 取り消しでしか起きない (自分の入力は onChange で Board に渡した
  // ものがそのまま返ってくるので一致する)。
  // 子 (ここ) の layout effect は親 (Board) の layout effect より先に走るので、Board の「描画後にカーソルを置く」
  // effect が動く時点で doc は新しい値になっている (この順序に依存している)。
  // 変更は前後の共通部分を除いた最小の範囲にする: 全置換だと履歴 (Ctrl+Z) の位置の対応が崩れる
  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    let from = 0;
    while (from < current.length && from < value.length && current[from] === value[from]) from++;
    let tail = 0;
    while (
      tail < current.length - from &&
      tail < value.length - from &&
      current[current.length - 1 - tail] === value[value.length - 1 - tail]
    )
      tail++;
    view.dispatch({
      changes: { from, to: current.length - tail, insert: value.slice(from, value.length - tail) },
      annotations: [externalSync.of(true), Transaction.addToHistory.of(false)],
    });
  }, [value]);

  useLayoutEffect(() => {
    viewRef.current?.dispatch({ effects: configCompartment.reconfigure(config()) });
  }, [placeholder, readOnly, ariaLabel]);

  return <div ref={hostRef} className={classes.root} />;
}

type Callbacks = Pick<
  Props,
  "onBackspaceAtStart" | "onDeleteAtEnd" | "onArrowUpAtFirstLine" | "onArrowDownAtLastLine" | "onEscape"
>;

/** 選択が無い (カーソルだけ) なら head。IME 変換中は境界処理をしない (null) */
function cursorOf(view: EditorView): number | null {
  const sel = view.state.selection.main;
  if (view.composing || !sel.empty || view.state.selection.ranges.length > 1) return null;
  return sel.head;
}

/**
 * カーソル a が b と表示上 (折り返しを考慮) 同じ行にあるか。文字の座標の top で比べる (同じ行の文字は同じ top)。
 * 座標が取れない (未計測) ときは null
 */
function sameVisualRow(view: EditorView, a: number, b: number, forward: boolean): boolean | null {
  // 折り返し位置ではカーソルの側 (assoc) に合わせる。assoc が 0 (クリックや handle.focus で置いたカーソル) なら
  // 移動方向の側: ↓ は次の行側、↑ は前の行側 (@codemirror/commands の moveVertically と同じ解決にしないと、
  // 判定と実際の移動がずれて ↓ を 2 回押さないと次のセクションへ行けない)
  const ca = view.coordsAtPos(a, view.state.selection.main.assoc || (forward ? 1 : -1));
  const cb = view.coordsAtPos(b);
  if (!ca || !cb) return null;
  return Math.abs(ca.top - cb.top) <= SAME_ROW_TOLERANCE;
}

/**
 * セクションの境界のキー。standardKeymap より先に見る (Prec.highest)。
 * 修飾キー付き (Shift+↑ の選択など) はこれらの key に一致しないのでそのまま通る
 */
function boundaryKeymap(callbacks: { current: Callbacks }): KeyBinding[] {
  const backspace = (view: EditorView) => {
    if (view.composing) return false;
    const head = cursorOf(view);
    if (head === 0) {
      callbacks.current.onBackspaceAtStart();
      return true;
    }
    // 行頭の空白をインデント単位でまとめて消さない (Textarea と同じく 1 文字ずつ)
    return deleteCharBackwardStrict(view);
  };
  return [
    // Shift+Backspace も同じ (standardKeymap は shift にも deleteCharBackward を割り当てていて、
    // 付けないとそちらのインデント単位の削除に落ちる)
    { key: "Backspace", run: backspace, shift: backspace },
    {
      key: "Delete",
      run(view) {
        if (cursorOf(view) !== view.state.doc.length) return false;
        callbacks.current.onDeleteAtEnd();
        return true;
      },
    },
    {
      key: "ArrowUp",
      run(view) {
        const head = cursorOf(view);
        if (head === null) return false;
        // 座標が取れないときは論理行で判定する
        const first = sameVisualRow(view, head, 0, false) ?? view.state.doc.lineAt(head).number === 1;
        return first && callbacks.current.onArrowUpAtFirstLine();
      },
    },
    {
      key: "ArrowDown",
      run(view) {
        const head = cursorOf(view);
        if (head === null) return false;
        const { doc } = view.state;
        const last = sameVisualRow(view, head, doc.length, true) ?? doc.lineAt(head).number === doc.lines;
        return last && callbacks.current.onArrowDownAtLastLine();
      },
    },
    // Enter は箇条書きだけ同じ階層で続け、それ以外は単純な改行 (standardKeymap の insertNewlineAndIndent は
    // 行頭の空白を次の行にコピーし、カーソル直後の空白を食うので Textarea の挙動から変わってしまう)。
    // Shift+Enter は常に単純な改行 (項目の中で続きの行を書く逃げ道)
    { key: "Enter", run: insertNewlineContinueList, shift: insertNewline },
    // Tab はインデント (リストの階層下げ / タブ挿入)、Shift+Tab は戻し (src/lib/list-indent.ts)
    { key: "Tab", run: indentMoreOrInsertTab, shift: indentLess },
    // Esc で編集をやめる (blur して onEscape → Board が Markdown 表示に切り替え、そこへフォーカスを移す)。
    // 選択があれば 1 回目の Esc は選択の解除だけ (多くのエディタと同じ。いきなり抜けると選択とカーソル位置を失う)。
    // IME 変換中の Esc は変換の取り消しなので触らない
    {
      key: "Escape",
      run(view) {
        if (view.composing) return false;
        if (simplifySelection(view)) return true;
        view.contentDOM.blur();
        callbacks.current.onEscape();
        return true;
      },
    },
  ];
}
