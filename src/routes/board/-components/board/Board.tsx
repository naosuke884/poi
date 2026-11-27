import { MEMO_TTL_DAYS } from "@shared/constants";
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { Affix } from "@/components/Affix";
import { BottomLeftNotice } from "@/components/BottomLeftNotice";
import { Button } from "@/components/Button";
import { HeaderSlot } from "@/components/HeaderSlot";
import { IconButton } from "@/components/IconButton";
import { PlusIcon } from "@/components/TablerIcon";
import { Tooltip } from "@/components/Tooltip";
import { affixInset } from "@/lib/affix";

import type { BoardSection, EditableSection } from "../../-lib/data/board";
import type { Tag } from "../../-lib/data/tags";
import { keepEditorFocus } from "../../-lib/keep-editor-focus";
import { deliverImage, renderSectionImage } from "../../-lib/section-export";
import {
  appendSection,
  changeSection,
  mergeSections,
  sectionMaxLength,
} from "../../-lib/sections/board-ops";
import { useBoardSections } from "../../-lib/sections/use-board-sections";
import { useSectionFocus } from "../../-lib/sections/use-section-focus";
import { useUndoableDelete } from "../../-lib/sections/use-undoable-delete";
import {
  ALL_SECTIONS,
  fitToFilter,
  nearestInFilter,
  neighborInFilter,
  type TagFilter,
  untagBlankSections,
} from "../../-lib/tag-filter";
import { BoardTagsContext, useBoardTags } from "../../-lib/use-board-tags";
import { useKeyboardInset } from "../../-lib/use-keyboard-inset";
import { useStableHandlers } from "../../-lib/use-stable-handlers";
import { AddSectionButton } from "./header/AddSectionButton";
import { SaveStatusIcon } from "./header/SaveStatusIcon";
import type { EditAnchor } from "./section/SectionEditor";
import { type SectionHandlers, type SectionRefs, SectionRow } from "./section/SectionRow";
import { TagFilterBar } from "./TagFilterBar";

import classes from "./Board.module.css";

// セクションが 1 つだけのときのエディタのプレースホルダ (書き方の案内)
const PLACEHOLDER = [
  "ここに書く…",
  `セクションごとに ${MEMO_TTL_DAYS} 日で消えます`,
  "Markdown が使えます (# 見出し、- 箇条書き)",
  "Tab でインデント、Esc で編集をやめる",
].join("\n");

/**
 * 板。セクション (= 1 つの memo、30 日で消える) を 1 枚ずつカードにして縦に並べる。
 * 編集中 (フォーカスのある) セクションだけエディタ (SectionEditor = CodeMirror。Markdown ソースのまま、
 * 見出し・記号・URL を装飾して表示する) で、それ以外は Markdown をレンダリングして表示する (MarkdownView。
 * クリックするとその場所にカーソルを置いてエディタに戻る)。内容はそのまま Markdown テキストとして保存する
 * - セクションは「セクションを追加」(PC 幅ではヘッダー、狭い画面では右下のボタン) で増やす。空行はいくつ続けても
 *   同じセクションの中に残る (入力で分ける仕組みは無くした: 空行を続けたいだけのときに勝手に分かれたため)。
 *   先頭で Backspace / 末尾で Delete で隣と結合、↑↓ で隣のセクションへ移る (Notion のブロック風)。
 *   Tab / Shift+Tab はインデント操作、Esc で編集をやめる (Markdown 表示に戻り、そこにフォーカスが移る。
 *   その状態の ↑↓ で隣のセクションの表示へ移り、Enter で編集に戻る)。
 *   境界の判定はエディタが行い (SectionEditor のコールバック)、ここでは何をするかだけ決める。
 *   結合ではフォーカスのあるエディタの DOM (key) をそのまま使い回し、カーソルだけ動かす
 *   (エディタを作り直してフォーカスを移すと、タッチ端末ではキーボードが閉じたり新しいエディタに
 *   フォーカスが渡らなかったりする)
 * - 各セクションが自分の id を持つので、保存はそのまま PUT /api/board に送るだけ (id が期限を引き継ぐ)。
 *   空のセクションは送らない (画面には残る)
 * - 入力停止から 1 秒後に丸ごと保存する (自動保存。useBoardAutosave)。保存状態はヘッダーのアイコン
 *   (SaveStatusIcon) に出す
 * - カードの上の行のボタンでセクションをコピー (Markdown テキスト) / スクショ (Markdown 表示を PNG に) できる
 * revision は sections の時点の板の版 (保存時に送る。別の場所で保存されていたら取り込んでから保存し直す)。
 * userId は保存成功時にオフライン閲覧用キャッシュを更新するためのキー。
 * tags は登録済みのタグ (開いた時点のもの。その後の登録・名前の変更・削除は useBoardTags が持ち、板を取り直したときにも更新する)。
 * readOnly はオフラインでキャッシュから表示しているとき (入力不可・保存しない)
 */
export function Board({
  sections: initial,
  revision = null,
  tags: initialTags = [],
  userId,
  readOnly = false,
}: {
  sections: BoardSection[];
  revision?: string | null;
  tags?: Tag[];
  userId: string;
  readOnly?: boolean;
}) {
  // 画面上のセクションと編集の入口 (update = 状態の更新 + 自動保存の予約)。
  // state (sections) は描画用で、ハンドラは常に latestRef (同じ内容) を読む
  // 登録済みのタグと、タグでの絞り込み
  const tags = useBoardTags({ initial: initialTags, userId, readOnly });
  const { filter, isShown: isVisible } = tags;

  const { sections, latestRef, update, saveState } = useBoardSections({
    initial,
    initialRevision: revision,
    userId,
    readOnly,
    // 取り直したときに届く登録済みのタグ (別の端末での登録・名前の変更・削除) も反映する
    onTags: tags.setFetched,
    registeredAsOf: tags.registeredAsOf,
  });

  // 編集中 (エディタで表示する) セクション。それ以外は Markdown 表示。null はどれも編集していない。
  // 開いた直後はどれも編集していない (全部 Markdown 表示。タップ / クリックでエディタに切り替わる)
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const editingKeyRef = useRef(editingKey);
  editingKeyRef.current = editingKey;

  const {
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
  } = useSectionFocus({ latestRef, sections, setEditingKey });

  // 右下固定の追加ボタンがソフトキーボードの裏に隠れないよう、キーボード分だけ持ち上げる
  const keyboardInset = useKeyboardInset();

  const indexOf = (key: string) => latestRef.current.findIndex((s) => s.key === key);

  const { deleted, closeUndo, holdUndo, removeSection, undoDelete } = useUndoableDelete({
    latestRef,
    focusLater,
    update,
  });

  // キーボードで削除したら「元に戻す」へフォーカスを移す (DOM の末尾の通知には Tab で届かないので。#112)。
  // 通知 (Affix) は body へのポータルで、ボタンが現れる (ref が付く) のと deleted が変わる effect の
  // どちらが先かは描画の仕方で変わるので、予約しておいてボタンが現れた時点でも移す
  const undoButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusUndoRef = useRef(false);
  const focusUndoButton = () => {
    const el = undoButtonRef.current;
    if (!el || !focusUndoRef.current) return;
    focusUndoRef.current = false;
    el.focus();
  };
  const setUndoButton = useCallback((el: HTMLButtonElement | null) => {
    undoButtonRef.current = el;
    focusUndoButton();
    // ref だけを読むので作り直さない
  }, []);
  useEffect(() => {
    if (!deleted?.focusUndo) return;
    focusUndoRef.current = true;
    focusUndoButton();
  }, [deleted]);

  // 絞り込みのバー。フォーカスの行き先のセクションが無くなったときは、選んでいる絞り込みのボタンへ移す。
  // 描画の後に移す: 隠れるセクションの中の操作 (タグを選ぶ欄を閉じてタグのボタンへ戻すなど) が、その前にフォーカスを動かすことがある
  const filterBarRef = useRef<HTMLDivElement>(null);
  const focusFilterLaterRef = useRef(false);
  useEffect(() => {
    if (!focusFilterLaterRef.current) return;
    focusFilterLaterRef.current = false;
    filterBarRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  });

  // 削除した場所 (index) の前後のセクションへフォーカスを移す (#112)。後ろが無ければ前へ。
  // 空のセクション (常にエディタ) と編集中のものはエディタへ、それ以外は Markdown 表示へ (Esc で抜けたときと同じ)。
  // どちらも描画後に移す (削除や通知を閉じた描画の後。表示から消える要素にフォーカスを置かないように)
  const focusSectionNear = (index: number) => {
    // 絞り込みで画面に出ていないセクションは飛ばす
    const s = nearestInFilter(latestRef.current, index, isVisible);
    // 絞り込みに当てはまるセクションがもう無い: 選んでいる絞り込みのボタンへ (body に落とさない)
    if (!s) {
      focusFilterLaterRef.current = true;
      return;
    }
    if (s.content.trim() === "" || editingKeyRef.current === s.key) {
      focusLater(s.key, s.content.length);
    } else {
      focusViewLater(s.key);
    }
  };
  // 削除ボタン。フォーカスがそのセクションの中 (削除ボタン自身や編集中のエディタ) にあったときだけ前後へ移す。
  // 別のセクションを編集しながらマウスで押したときは、そのエディタにフォーカスを残す (keepEditorFocus)
  const remove = (key: string, viaKeyboard: boolean) => {
    const index = indexOf(key);
    const hadFocus = boxesRef.current.get(key)?.contains(document.activeElement) ?? false;
    removeSection(key, {
      viaKeyboard,
      returnFocus: hadFocus || viaKeyboard ? () => focusSectionNear(index) : null,
    });
  };

  // 入力 (配列の変換は board-ops)
  const change = (key: string, value: string) => {
    const next = changeSection(latestRef.current, key, value);
    if (next) update(next);
  };

  // i 番目と i+1 番目をつなげ、カーソルをつなぎ目に置く
  const merge = (i: number, focused: string) => {
    const r = mergeSections(latestRef.current, i, focused, tags.byIdNow());
    if (!r) return;
    focusLater(r.focus.key, r.focus.offset);
    update(r.next);
  };

  // 隣のセクションとの結合 / 移動。境界にいるかの判定 (選択なし・IME 変換中でない・先頭 / 末尾 / 表示上の
  // 最初 / 最後の行) は SectionEditor が行い、ここは隣が無ければ何もしない (↑↓ は false を返して通常の動きに任せる)
  // 結合するのは、板の並びですぐ隣にあって画面にも出ているセクションだけ。絞り込みで間のセクションが
  // 隠れているときは結合しない (見えていないセクションとつながったり、並びが入れ替わったりするため)
  const backspaceAtStart = (key: string) => {
    const i = indexOf(key);
    const prev = latestRef.current[i - 1];
    if (prev && isVisible(prev)) merge(i - 1, key);
  };
  const deleteAtEnd = (key: string) => {
    const i = indexOf(key);
    const next = i >= 0 ? latestRef.current[i + 1] : undefined;
    if (next && isVisible(next)) merge(i, key);
  };
  /** 画面に出ている、dir の向きで隣のセクション (絞り込みで隠れているものと、skip に当てはまるものは飛ばす) */
  const visibleNeighbor = (key: string, dir: -1 | 1, skip?: (s: EditableSection) => boolean) =>
    neighborInFilter(latestRef.current, key, dir, (s) => isVisible(s) && !skip?.(s));
  const arrowUpAtFirstLine = (key: string) => {
    const prev = visibleNeighbor(key, -1);
    if (!prev) return false;
    focus(prev.key, prev.content.length);
    return true;
  };
  const arrowDownAtLastLine = (key: string) => {
    const next = visibleNeighbor(key, 1);
    if (!next) return false;
    focus(next.key, 0);
    return true;
  };
  // Esc でフォーカスしたセクション表示 (MarkdownView) からの ↑↓: 隣のセクションの表示へフォーカスを移す
  // (PC のキーボード操作。Enter で編集に戻れる)。空のセクションは表示要素が無いので飛ばす
  const focusViewFrom = (key: string, dir: -1 | 1) => {
    const s = visibleNeighbor(key, dir, (s) => s.content.trim() === "");
    if (!s) return false;
    focusView(s.key);
    return true;
  };
  // Esc: エディタを Markdown 表示に戻し、描画後にその表示へフォーカスを移す。
  // CodeMirror の blur 通知 (onBlur) は 10ms 遅れて届くので待たない (その間に別の描画 (自動保存の状態表示など) が
  // 入ると、予約したフォーカス移動がその描画で使われてしまい、フォーカスが移らない)
  const exitEditing = (key: string) => {
    focusViewLater(key);
    setEditingKey((k) => (k === key ? null : k));
  };

  // 「セクションを追加」ボタン (PC 幅ではヘッダー、狭い画面では右下固定):
  // 空のセクションを末尾に足してカーソルを置く。
  // 末尾が既に空ならそれを使う (空のセクションは保存されないので、増やしても意味がない。appendSection)
  const addSection = () => {
    const cur = latestRef.current;
    const { next, focus: target } = appendSection(cur);
    // 絞り込んでいる間に作った書く場所は、その絞り込みに当てはまるタグにする (作ったそばから消えないように)
    const fitted = fitToFilter(next ?? cur, new Set([target.key]), filter);
    // そこへは滑らかに動かす (一気に飛ぶと、どこに足されたのか分からない)。カーソルを置くときのスクロールはさせない
    if (fitted !== cur) {
      focusLater(target.key, target.offset, "none");
      update(fitted);
    } else {
      focus(target.key, target.offset, "none");
    }
    // 書く場所のカード全体 (書式のツールバーまで) を、ヘッダーの下・追加ボタンの上に見せる (見切れないように)。
    // 編集を始める描画の後で行う (ツールバーはそこで現れる)
    revealLater(target.key);
  };

  // 絞り込みを変えたら編集をやめる (編集中のセクションが画面から消えることがある)。
  // 予約済みのフォーカス移動も、行き先が消えているかもしれないので捨てる
  const changeFilter = (next: TagFilter) => {
    setEditingKey(null);
    cancelPending();
    tags.setFilter(next);
    // 閲覧だけの板 (オフライン) は書き換えない (保存しようとして、閉じるときに未保存の確認が出てしまう)
    const untagged = readOnly ? latestRef.current : untagBlankSections(latestRef.current);
    if (untagged !== latestRef.current) update(untagged);
    // 見ていた高さは別の並びのものなので、先頭から見せる
    window.scrollTo({ top: 0 });
  };

  // 「元に戻す」。消した後に絞り込みを変えていて、戻すセクションが今の絞り込みに当てはまらなければ
  // 「すべて」に戻してから戻す (隠れた場所に戻ると、何も起きなかったように見える)
  const undo = () => {
    if (deleted && !isVisible(deleted.removed.section)) {
      changeFilter(ALL_SECTIONS);
    }
    undoDelete();
  };

  // 最後のセクションより下の空き領域 (やセクションの外枠の余白) をクリックしたら末尾にカーソルを置く
  // (画面全体が書ける場所に見えるように)。
  // mousedown を止めて、編集中のエディタがクリックの途中で blur (→ Markdown 表示) しないようにする
  const isBlank = (e: MouseEvent<HTMLDivElement>) =>
    e.target === e.currentTarget || (e.target as HTMLElement).hasAttribute("data-section");
  const focusEnd = (e: MouseEvent<HTMLDivElement>) => {
    if (readOnly || !isBlank(e)) return;
    const last = latestRef.current.findLast(isVisible);
    // 末尾へ飛ぶ操作なので、セクションをタップして編集に移るときと同じ置き方にする。
    // 絞り込みに当てはまるセクションが無ければ、書く場所を作る
    if (last) focus(last.key, last.content.length, "top");
    else addSection();
  };
  const keepFocus = (e: MouseEvent<HTMLDivElement>) => {
    if (isBlank(e)) e.preventDefault();
  };

  // セクションを画像にする。編集中 (エディタ) なら先に Markdown 表示へ切り替え、その描画を同期的に済ませてから
  // (flushSync) その要素を撮る。空のセクションには表示要素が無いのでボタン自体を出さない
  const screenshot = (key: string) => {
    flushSync(() => setEditingKey((k) => (k === key ? null : k)));
    const el = viewsRef.current.get(key);
    if (!el) throw new Error("空のセクションは画像にできません");
    return deliverImage(renderSectionImage(el));
  };

  // フォーカスが外れたら Markdown 表示に戻す。ただしウィンドウ自体がフォーカスを失った場合
  // (タブ切り替えなど) は編集中のまま (戻ってきたときにカーソル位置を保つ)。
  // 別のセクションへ移るときは、移った先が先に editingKey になっているので何もしない
  const onBlur = (key: string, anchor: EditAnchor | null) => {
    if (!document.hasFocus()) return;
    // ここで本当に編集をやめる (別のセクションへ移ったのでも、Esc で既にやめたのでもない) ときだけ、
    // 描画後にスクロールを合わせるためのカーソル位置を控える (#45)
    if (editingKeyRef.current === key && anchor) keepAnchorLater(key, anchor);
    setEditingKey((k) => (k === key ? null : k));
  };

  // 各セクション (SectionRow) への操作。SectionRow は memo しているので、同一性の変わらない
  // オブジェクトにして渡す (呼ぶと最新の描画の関数が動く。入力のたびに全セクションを描き直さないため: issue #114)
  const handlers = useStableHandlers<SectionHandlers>({
    change,
    startEditing: setEditingKey,
    blur: onBlur,
    exitEditing,
    backspaceAtStart,
    deleteAtEnd,
    arrowUpAtFirstLine,
    arrowDownAtLastLine,
    // 編集に移るときは、その場所を画面の上のほうに出す (下のほうをタップしたとき、
    // キーボードの上に書く場所が残らないため)
    edit: (key, pos) => focus(key, pos, "top"),
    navigateView: focusViewFrom,
    screenshot,
    remove,
    // 各セクションに書ける文字数。他のセクションへの入力で変わるので、エディタが入力のたびに最新の値を聞く
    maxLength: (key) => sectionMaxLength(latestRef.current, key),
    setTag: (key, tagId) => {
      const index = indexOf(key);
      const hadFocus = boxesRef.current.get(key)?.contains(document.activeElement) ?? false;
      update(latestRef.current.map((s) => (s.key === key ? { ...s, tagId } : s)));
      // 絞り込みに当てはまらなくなったセクションは画面から消える。中にあったフォーカス (タグのボタンや
      // ポップオーバー) が body に落ちないよう、消した後と同じく前後のセクションへ移す。
      // フォーカスが外にあれば動かさない (登録の返事を待つ間に、別のセクションを書き始めていることがある)
      if (hadFocus && !isVisible({ tagId })) focusSectionNear(index);
    },
    reloadTags: tags.reload,
    registerTag: tags.register,
    renameTag: tags.rename,
    unregisterTag: tags.unregister,
  });
  // 絞り込みのバー (memo している) に渡す。描画のたびに作り直すと memo が外れる
  const { changeFilter: stableFilterChange } = useStableHandlers({ changeFilter });
  const refs: SectionRefs = useMemo(
    () => ({ boxes: boxesRef, views: viewsRef, editors: elementsRef }),
    [boxesRef, viewsRef, elementsRef],
  );
  // 絞り込みに当てはまる (画面に出す) セクション。読み上げの名前の番号 (「セクション 3」) もこの中での順番にする
  // (絞り込んでいるときに板全体の位置で数えると、2 つしか出ていないのに「セクション 9」になる)
  const visible = sections.filter(isVisible);
  return (
    <BoardTagsContext value={tags.tags}>
      <div className={classes.board} data-filter-bar={tags.tags.length > 0 ? true : undefined}>
        {/* ヘッダーに出す板の操作 (板を表示している間だけ)。追加ボタンは編集できるときだけ */}
        <HeaderSlot>
          {!readOnly && <AddSectionButton onClick={addSection} />}
          <SaveStatusIcon state={saveState} />
        </HeaderSlot>

        {/* タグでの絞り込み。タグが 1 つも無ければ出さない (タグを使わない人の板は今までどおり) */}
        {tags.tags.length > 0 && (
          <TagFilterBar
            ref={filterBarRef}
            tags={tags.tags}
            filter={filter}
            onChange={stableFilterChange}
          />
        )}
        {/* 空きのクリックはマウス / タッチ向けの近道 (キーボードでは各セクションに Tab で入れる) */}
        {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div
          className={classes.timeline}
          data-writable={readOnly ? undefined : true}
          onClick={focusEnd}
          onMouseDown={keepFocus}
        >
          {visible.map((s, i) => {
            const tag = tags.tagOf(s);
            return (
              <SectionRow
                key={s.key}
                section={s}
                index={i}
                editing={s.key === editingKey}
                readOnly={readOnly}
                placeholder={sections.length === 1 ? PLACEHOLDER : undefined}
                tagName={tag?.name}
                tagIcon={tag?.icon}
                handlers={handlers}
                refs={refs}
              />
            );
          })}
          {/* 絞り込みに当てはまるセクションが無いとき (書く場所は「セクションを追加」で作れる) */}
          {visible.length === 0 && (
            <p className={classes.empty}>
              {filter.kind === "tag" ? `「${tags.byId.get(filter.tagId)?.name}」` : "タグなし"}
              のメモはまだありません。
            </p>
          )}
        </div>

        {/* 右下固定の追加ボタンの下に本文が隠れないよう、スクロールの終端に余白を足しておく */}
        <div className={classes.endSpacer} />

        {/* セクションを追加 (右下固定。狭い画面のみ: PC 幅 (sm 以上) ではヘッダーの AddSectionButton)。
          固定表示なので、板が長くてもスクロールせずに押せる */}
        {!readOnly && (
          <Affix
            className={classes.fab}
            style={{
              bottom: `calc(16px + env(safe-area-inset-bottom) + ${keyboardInset}px)`,
              insetInlineEnd: affixInset("right"),
            }}
          >
            <Tooltip label="セクションを追加" withArrow>
              <IconButton
                size="xl"
                round
                className={classes.fabButton}
                aria-label="セクションを追加"
                onMouseDown={keepEditorFocus}
                onClick={addSection}
              >
                <PlusIcon size={22} />
              </IconButton>
            </Tooltip>
          </Affix>
        )}

        {/* 削除の取り消し (左下角。PwaUpdateBanner はこの上、右下は追加ボタン)。
          ホバーかフォーカスがある間は消えるまでの時間を止める (読んでいる途中や押す直前に消えないように)。
          Esc でも閉じられる (キーボードで「元に戻す」に移ってきたときの戻り道。フォーカスは削除した場所の前後へ) */}
        {deleted && (
          <BottomLeftNotice
            title="セクションを削除しました"
            onClose={closeUndo}
            onMouseEnter={() => holdUndo("hover", true)}
            onMouseLeave={() => holdUndo("hover", false)}
            onFocus={() => holdUndo("focus", true)}
            onBlur={(e) => {
              // 通知の中でのフォーカスの移動 (「元に戻す」→ ×) は離れたことにしない
              if (!e.currentTarget.contains(e.relatedTarget)) holdUndo("focus", false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeUndo();
            }}
          >
            <Button
              ref={setUndoButton}
              size="xs"
              variant="default"
              className={classes.undo}
              onClick={undo}
            >
              元に戻す
            </Button>
          </BottomLeftNotice>
        )}
      </div>
    </BoardTagsContext>
  );
}
