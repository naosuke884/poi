import { type RefObject, useLayoutEffect, useReducer, useRef } from "react";

import type {
  CursorPlace,
  EditAnchor,
  SectionEditorHandle,
} from "../../-components/board/section/SectionEditor";
import type { EditableSection } from "../data/board";
import { clientTopAtSourceOffset } from "../markdown/markdown-source-offset";
import { viewportInsets } from "../use-keyboard-inset";

/**
 * Board のフォーカスとスクロールの調整。
 * 各セクションのエディタ / Markdown 表示 / 外枠の DOM を key で控え、
 * state を変える操作の後のフォーカス移動 (描画を待たないと移る先の要素が無い) は
 * pending の ref に予約して layout effect で実行する。
 * layout effect の並びに意味がある (カード全体を見せるのはカーソルを置いた後) ので、ここでまとめて順に登録する
 */
export function useSectionFocus({
  latestRef,
  sections,
  setEditingKey,
}: {
  latestRef: RefObject<EditableSection[]>;
  /** 描画中のセクション (state)。スクロールの合わせ直しは描画済みの内容に対して行う */
  sections: EditableSection[];
  setEditingKey: (key: string | null) => void;
}) {
  // key → エディタのハンドル。結合 / ↑↓ の後にカーソルを移すのに使う
  const elementsRef = useRef(new Map<string, SectionEditorHandle>());
  // key → Markdown 表示の要素 (スクショの対象)
  const viewsRef = useRef(new Map<string, HTMLDivElement>());
  // key → セクションの外枠 (カードの上の行を含む。スクロール位置を合わせる対象)
  const boxesRef = useRef(new Map<string, HTMLDivElement>());
  // 次の描画後にカーソルを置く先 (state を変える操作で使う。描画を待たないと新しいエディタが無い)
  const pendingFocusRef = useRef<{
    key: string;
    pos: number;
    /** カーソルを画面のどこに置くか (SectionEditor の CursorPlace) */
    place: CursorPlace;
  } | null>(null);
  // Esc で編集をやめたセクション。描画後にその Markdown 表示へフォーカスを移す (Tab はそこから先へ進み、
  // ↑↓ で隣のセクションの表示へ、Enter で編集に戻れる)。空のセクションは Markdown 表示が無いので何もしない
  const pendingViewFocusRef = useRef<string | null>(null);
  // 作ったばかりのセクション。描画後 (カーソルを置いた後) に、カード全体 (上の行から書式のツールバーまで) を見せる
  const pendingRevealRef = useRef<string | null>(null);
  // 編集をやめたセクションと、そのときのカーソル (位置と画面上の高さ)。描画後に同じ高さへ合わせ直す
  const pendingAnchorRef = useRef<{ key: string; anchor: EditAnchor } | null>(null);

  // 編集に入る前に、そのカーソル位置が Markdown 表示のどの高さに描かれているか (client 座標の上端)。
  // 表示とエディタでは同じ内容でも高さが変わるので、切り替えた後にこの高さへ戻す (#45)。
  // 表示が無い (空 / これから作るセクション) なら合わせる先が無いので null
  const viewTopAt = (key: string, pos: number) => {
    const view = viewsRef.current.get(key);
    const content = latestRef.current.find((s) => s.key === key)?.content;
    if (!view || content === undefined) return null;
    return clientTopAtSourceOffset(view, content, pos);
  };
  // 描画後にカーソルを置く (エディタがまだ無いセクションを編集状態にしてから)。
  // place を渡さないときは、切り替える前に同じ場所が描かれていた高さ (= 見ていた位置) を保つ。
  // エディタの中の ↑↓ で隣のセクションへ移るときがこれ (移動先は隣なので、動かさないほうが続けて書きやすい)
  const focusLater = (key: string, pos: number, place?: CursorPlace) => {
    pendingFocusRef.current = { key, pos, place: place ?? viewTopAt(key, pos) };
    setEditingKey(key);
  };
  const focus = (key: string, pos: number, place?: CursorPlace) => {
    const editor = elementsRef.current.get(key);
    if (!editor) {
      focusLater(key, pos, place);
      return;
    }
    setEditingKey(key);
    editor.focus(pos, place);
  };
  // SectionEditor は自分の layout effect (親より先に走る) で value を doc に反映済みなので、ここで置く
  // カーソル位置は新しい内容に対するもの
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const editor = elementsRef.current.get(pending.key);
    if (!editor) return; // 次の描画でエディタが現れるまで待つ
    pendingFocusRef.current = null;
    editor.focus(pending.pos, pending.place);
  });
  // 追加ボタンで作ったセクションのカード全体が、貼り付いたヘッダー・絞り込みの行の下から、右下の追加ボタン
  // (狭い画面) とソフトキーボードの上までに収まるよう、最小限だけ滑らかにスクロールする (一気に飛ぶと、どこに
  // 足されたのか分からない)。収まっていれば動かさない。
  // カーソルへのスクロール (CodeMirror) には任せない: カーソルの行と下 3 行ぶんしか見ないので書式のツールバーが
  // 画面の下端や追加ボタンの裏に掛かるうえ、一気に動く。カーソルは "none" で置いてスクロールさせない
  // (CodeMirror が動いた後で元の位置へ戻してから滑らかに動かす形にすると、開発時の StrictMode が
  // エディタを作り直してカーソルを置き直すときのスクロールで、動いている途中のスクロールが止まった)。
  // scrollIntoView も使わない: キーボードで隠れた下端 (visual viewport の外) を知らないため
  const reveal = (key: string) => {
    const box = boxesRef.current.get(key);
    if (!box) return;
    const behavior = scrollBehavior();
    refitWhileSettling(box, behavior);
    // 画面に収まらないほど低い画面なら、カーソルのある冒頭を上端に出す
    const delta = overflowOf(box) ?? box.getBoundingClientRect().top - bandOf(box).top;
    if (delta !== 0) window.scrollTo({ top: window.scrollY + delta, behavior });
  };
  // 描画後に key のカード全体を見せる (reveal)。もう編集中のセクションなど、ほかに描画が起きないときも
  // 描き直して行う (呼ぶ側が描画が起きるかを見分けなくて済むように)
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const revealLater = (key: string) => {
    pendingRevealRef.current = key;
    rerender();
  };
  useLayoutEffect(() => {
    const key = pendingRevealRef.current;
    // カーソルを置くのが次の描画に持ち越されたら、それを待つ (カード全体はエディタに切り替わってから測る)
    if (key === null || pendingFocusRef.current !== null) return;
    pendingRevealRef.current = null;
    reveal(key);
  });

  // セクションの Markdown 表示にフォーカスを移す。カーソルへの自動スクロールの代わりに、
  // カードの上の行ごと見えるよう外枠を最小限だけスクロールする
  const focusView = (key: string) => {
    viewsRef.current.get(key)?.focus({ preventScroll: true });
    boxesRef.current.get(key)?.scrollIntoView({ block: "nearest" });
  };
  useLayoutEffect(() => {
    const key = pendingViewFocusRef.current;
    if (key === null) return;
    pendingViewFocusRef.current = null;
    focusView(key);
  });
  // 編集をやめて Markdown 表示に戻ったら、カーソルのあった場所が画面上の同じ高さに残るようにスクロールする。
  // 同じ内容でもソースのまま (エディタ) とレンダリング後 (表示) では高さが違うので、何もしないと
  // 見ていた場所が上下にずれる (文字の大きいスマホでは特に大きくずれる。#45)。
  // Esc で抜けるときは使わない (focusView がカードの上の行ごと見えるように合わせる。onBlur 側で予約しない)
  useLayoutEffect(() => {
    const pending = pendingAnchorRef.current;
    if (!pending) return;
    pendingAnchorRef.current = null;
    const view = viewsRef.current.get(pending.key);
    const content = sections.find((s) => s.key === pending.key)?.content;
    if (!view || content === undefined) return; // 空になった: 合わせる先が無い
    const top = clientTopAtSourceOffset(view, content, pending.anchor.pos);
    if (top !== null) window.scrollBy(0, top - pending.anchor.top);
  });

  /** 次の描画の後に、key の Markdown 表示へフォーカスを移す (編集をやめる・消すなど、描画を起こす操作と一緒に呼ぶ) */
  const focusViewLater = (key: string) => {
    pendingViewFocusRef.current = key;
  };
  /** 次の描画の後に、編集をやめた key のカーソルのあった場所を、画面上の同じ高さへ戻す */
  const keepAnchorLater = (key: string, anchor: EditAnchor) => {
    pendingAnchorRef.current = { key, anchor };
  };
  /** 予約したフォーカス移動とスクロールを捨てる (絞り込みを変えて、行き先が画面から消えたかもしれないとき) */
  const cancelPending = () => {
    pendingFocusRef.current = null;
    pendingViewFocusRef.current = null;
    pendingRevealRef.current = null;
    pendingAnchorRef.current = null;
  };

  return {
    elementsRef,
    viewsRef,
    boxesRef,
    focus,
    focusLater,
    focusView,
    focusViewLater,
    keepAnchorLater,
    revealLater,
    cancelPending,
  };
}

/**
 * カードを収めたい範囲 (client 座標の上端と下端)。上下の余白は外枠の scroll-margin (SectionRow.module.css) を
 * そのまま読む (CSS 変数の calc をここで解かない)
 */
function bandOf(box: HTMLElement): { top: number; bottom: number } {
  const style = getComputedStyle(box);
  const insets = viewportInsets();
  return {
    top: Math.max(Number.parseFloat(style.scrollMarginTop) || 0, insets.top),
    bottom: window.innerHeight - insets.bottom - (Number.parseFloat(style.scrollMarginBottom) || 0),
  };
}

/** カードを画面に収めるのに要るスクロール量 (下へ正)。収まっていれば 0、画面に収まらないほど長ければ null */
function overflowOf(box: HTMLElement): number | null {
  const { top, bottom } = bandOf(box);
  const rect = box.getBoundingClientRect();
  if (rect.height > bottom - top) return null;
  if (rect.bottom > bottom) return rect.bottom - bottom;
  if (rect.top < top) return rect.top - top;
  return 0;
}

/**
 * 滑らかに動かすか。動きを減らす設定 (prefers-reduced-motion: reduce) なら一気に動かす
 * (window.scrollTo の smooth はこの設定を見ないブラウザがある)。
 * "auto" ではなく "instant": html に scroll-behavior: smooth が付いても一気に動くように
 */
function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
}

// 追加したカードを収め直す間 (ms)。ソフトキーボードが開ききるまでの目安
const SETTLE_MS = 1000;

/**
 * 滑らかなスクロールの途中で、カーソルへの一気のスクロールに止められたら、カードをもう一度収める。
 * 止めるのは 2 つ: ソフトキーボードが開いて画面 (visual viewport) が縮んだとき (押してすぐはまだ開いていない。
 * SectionEditor がカーソルの行を見えるところへ戻す) と、動いている途中で書き始めたとき (CodeMirror が
 * カーソルへスクロールする)。どちらもカーソルの行しか見ないので、書式のツールバーがキーボードや追加ボタンの裏に残る。
 * CodeMirror のスクロールは次のフレームの計測で行われるので、さらに次のフレームまで待つ
 * (先に動かすと、その計測のスクロールに打ち消される)。
 * 指やホイールでスクロールし始めたらやめる (読もうとしている場所を引き戻さないように。#137)
 */
function refitWhileSettling(box: HTMLElement, behavior: ScrollBehavior) {
  const vv = window.visualViewport;
  const refit = () =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const overflow = box.isConnected ? overflowOf(box) : null;
        if (overflow) window.scrollTo({ top: window.scrollY + overflow, behavior });
      }),
    );
  const stop = () => {
    clearTimeout(timer);
    vv?.removeEventListener("resize", refit);
    box.removeEventListener("input", refit);
    window.removeEventListener("touchmove", stop);
    window.removeEventListener("wheel", stop);
  };
  const timer = setTimeout(stop, SETTLE_MS);
  vv?.addEventListener("resize", refit);
  box.addEventListener("input", refit);
  window.addEventListener("touchmove", stop, { passive: true });
  window.addEventListener("wheel", stop, { passive: true });
}
