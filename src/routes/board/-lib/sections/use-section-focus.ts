import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  CursorPlace,
  EditAnchor,
  SectionEditorHandle,
} from "../../-components/board/section/SectionEditor";
import type { EditableSection } from "../data/board";
import { clientTopAtSourceOffset } from "../markdown/markdown-source-offset";

/**
 * Board のフォーカスとスクロールの調整。
 * 各セクションのエディタ / Markdown 表示 / 外枠の DOM を key で控え、
 * state を変える操作の後のフォーカス移動 (描画を待たないと移る先の要素が無い) は
 * pending の ref に予約して layout effect で実行する。
 * layout effect の並びに意味がある (reveal はフォーカスの後) ので、ここでまとめて順に登録する
 */
export function useSectionFocus({
  latestRef,
  sections,
  organized,
  setEditingKey,
}: {
  latestRef: RefObject<EditableSection[]>;
  /** 描画中のセクション (state)。スクロールの合わせ直しは描画済みの内容に対して行う */
  sections: EditableSection[];
  organized: boolean;
  setEditingKey: (key: string | null) => void;
}) {
  // key → エディタのハンドル。分割 / 結合 / ↑↓ の後にカーソルを移すのに使う
  const elementsRef = useRef(new Map<string, SectionEditorHandle>());
  // key → Markdown 表示の要素 (スクショの対象)
  const viewsRef = useRef(new Map<string, HTMLDivElement>());
  // key → セクションの外枠 (区切り線を含む。スクロール位置を合わせる対象)
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
  // 編集をやめたセクションと、そのときのカーソル (位置と画面上の高さ)。描画後に同じ高さへ合わせ直す
  const pendingAnchorRef = useRef<{ key: string; anchor: EditAnchor } | null>(null);

  // まとめ表示に切り替えたら編集をやめる (タイムラインに戻ったとき編集中のエディタが残らないように)。
  // タイムラインのスクロール位置 (最後のセクションが上端など) を引き継ぐと先頭のグループが
  // 見えないので、まとめの先頭へスクロールする
  useEffect(() => {
    if (!organized) return;
    setEditingKey(null);
    // 予約済みのフォーカス移動も破棄する (タイムラインに戻ったとき、いつかの操作の
    // フォーカスが不意に発火しないように)
    pendingFocusRef.current = null;
    pendingViewFocusRef.current = null;
    pendingAnchorRef.current = null;
    window.scrollTo({ top: 0 });
  }, [organized]);
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
  // セクションの Markdown 表示にフォーカスを移す。カーソルへの自動スクロールの代わりに、
  // 区切り線ごと見えるよう外枠を最小限だけスクロールする
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
  // Esc で抜けるときは使わない (focusView が区切り線ごと見えるように合わせる。onBlur 側で予約しない)
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

  // 最後のセクションの冒頭 (区切り線) が画面の上端 (ヘッダーの下) に来るようにスクロールする。
  // 開いたときと、末尾に新しいセクションができたときに使う (下端に張り付いたまま書き続けなくて済むように)。
  // 描画後に行う (末尾のセクションがまだ無いことがある)。同じ key でも毎回動かすので値はオブジェクトで持つ。
  // 上の effect (フォーカス) より後に置く: フォーカスでカーソル位置へスクロールした後に、こちらで上書きする
  // (SectionEditor の focus はそのためにカーソルへのスクロールを同期的に済ませる)
  const [reveal, setReveal] = useState<{ key: string } | null>(null);
  const revealLast = () => {
    const last = latestRef.current.at(-1);
    if (last) setReveal({ key: last.key });
  };
  // 開いたときは最後のセクションの冒頭を上端に出す。カーソルは置かない (全部 Markdown 表示のまま。
  // まず読み返すことが多く、タッチ端末では開くたびにキーボードが出てしまう)
  useEffect(() => {
    revealLast();
    // マウント時に一度だけ
  }, []);
  useLayoutEffect(() => {
    if (!reveal) return;
    const box = boxesRef.current.get(reveal.key);
    if (!box) return;
    box.scrollIntoView({ block: "start" });
    // 末尾に足したセクションのエディタ (CodeMirror) がマウントされていると、ここで合わせたスクロールが
    // 次のフレームの終わりにページ先頭まで巻き戻されてしまう (#47。スクロール API を介さないので上書きではなく
    // 巻き戻し。マウント直後の CodeMirror がある状態での最初のプログラムスクロールだけ起きる)。
    // その後のフレームでもう一度合わせる (1 回の rAF では巻き戻しより先に走ってしまい効かない)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (box.isConnected) box.scrollIntoView({ block: "start" });
      }),
    );
  }, [reveal]);

  return {
    elementsRef,
    viewsRef,
    boxesRef,
    pendingViewFocusRef,
    pendingAnchorRef,
    focus,
    focusLater,
    focusView,
    revealLast,
  };
}
