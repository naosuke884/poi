import { ActionIcon, Affix, Box, Button, Stack, Tooltip } from "@mantine/core";
import { BOARD_MAX_LENGTH, MEMO_TTL_DAYS, SECTION_SEPARATOR } from "@worker/memo/constants";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { PlusIcon } from "@/components/AddSectionButton";
import { BottomLeftNotice } from "@/components/BottomLeftNotice";
import { OrganizedView } from "@/components/OrganizedView";
import type { EditAnchor } from "@/components/SectionEditor";
import { type SectionHandlers, type SectionRefs, SectionRow } from "@/components/SectionRow";
import { affixInset } from "@/lib/affix";
import type { BoardSection } from "@/lib/board";
import { publishBoardActions } from "@/lib/board-actions";
import { appendSection, changeSection, mergeSections } from "@/lib/board-ops";
import { keepEditorFocus } from "@/lib/keep-editor-focus";
import { deliverImage, renderSectionImage } from "@/lib/section-export";
import { useBoardSections } from "@/lib/use-board-sections";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import { useSectionFocus } from "@/lib/use-section-focus";
import { useUndoableDelete } from "@/lib/use-undoable-delete";
import { publishViewToggle, setViewMode, useViewMode } from "@/lib/view-mode";

/**
 * 板。セクション (= 1 つの memo、30 日で消える) を縦に並べる。
 * 見た目は 1 枚の文書: 枠なしで画面いっぱいに広げ、セクションの境界は区切り線で示す。
 * 編集中 (フォーカスのある) セクションだけエディタ (SectionEditor = CodeMirror。Markdown ソースのまま、
 * 見出し・記号・URL を装飾して表示する) で、それ以外は Markdown をレンダリングして表示する (MarkdownView。
 * クリックするとその場所にカーソルを置いてエディタに戻る)。内容はそのまま Markdown テキストとして保存する
 * - 空行 2 つ (改行 3 つ) を入力するとそこでセクションが分かれて次のセクションへ移る (空行 1 つはセクションの中に残る)。
 *   先頭で Backspace / 末尾で Delete で隣と結合、↑↓ で隣のセクションへ移る (Notion のブロック風)。
 *   Tab / Shift+Tab はインデント操作、Esc で編集をやめる (Markdown 表示に戻り、そこにフォーカスが移る。
 *   その状態の ↑↓ で隣のセクションの表示へ移り、Enter で編集に戻る)。
 *   境界の判定はエディタが行い (SectionEditor のコールバック)、ここでは何をするかだけ決める。
 *   分割 / 結合ではフォーカスのあるエディタの DOM (key) をそのまま使い回し、カーソルだけ動かす
 *   (エディタを作り直してフォーカスを移すと、タッチ端末ではキーボードが閉じたり新しいエディタに
 *   フォーカスが渡らなかったりする)
 * - 各セクションが自分の id を持つので、保存はそのまま PUT /api/board に送るだけ (id が期限を引き継ぐ)。
 *   空のセクションは送らない (画面には残る)
 * - 入力停止から 1 秒後に丸ごと保存する (自動保存。useBoardAutosave)。保存状態はヘッダーのアイコン
 *   (SaveStatusIcon) に出す
 * - 区切り線のボタンでセクションをコピー (Markdown テキスト) / スクショ (Markdown 表示を PNG に) できる
 * userId は保存成功時にオフライン閲覧用キャッシュを更新するためのキー。
 * readOnly はオフラインでキャッシュから表示しているとき (入力不可・保存しない)。
 * ttlDays はそのユーザーの保存期間 (プレースホルダの「N 日で消えます」用。
 * オフラインのキャッシュ表示では取れないので既定値のまま)
 */
export function Board({
  sections: initial,
  userId,
  readOnly = false,
  ttlDays = MEMO_TTL_DAYS,
}: {
  sections: BoardSection[];
  userId: string;
  readOnly?: boolean;
  ttlDays?: number;
}) {
  // 画面上のセクションと編集の入口 (update = 状態の更新 + 自動保存の予約)。
  // state (sections) は描画用で、ハンドラは常に latestRef (同じ内容) を読む
  const { sections, latestRef, update } = useBoardSections({
    initial,
    userId,
    readOnly,
    ttlDays,
  });

  // 編集中 (エディタで表示する) セクション。それ以外は Markdown 表示。null はどれも編集していない。
  // 開いた直後はどれも編集していない (全部 Markdown 表示。タップ / クリックでエディタに切り替わる)
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const editingKeyRef = useRef(editingKey);
  editingKeyRef.current = editingKey;

  // 表示モード (#37): タイムライン (通常の板) / 見出しごとのまとめ (OrganizedView。閲覧のみ)。
  // 切替はヘッダーの ViewToggle が行い、モードはストア (view-mode) が持つ (Board が作り直されても保つ)
  const { mode } = useViewMode();
  const organized = mode === "organized";

  const {
    elementsRef,
    viewsRef,
    boxesRef,
    pendingViewFocusRef,
    pendingAnchorRef,
    focus,
    focusLater,
    focusView,
    revealLast,
  } = useSectionFocus({ latestRef, sections, organized, setEditingKey });

  // 右下固定の追加ボタンがソフトキーボードの裏に隠れないよう、キーボード分だけ持ち上げる
  const keyboardInset = useKeyboardInset();

  const indexOf = (key: string) => latestRef.current.findIndex((s) => s.key === key);

  const { deleted, cancelUndo, removeSection, removeGroup, undoDelete } = useUndoableDelete({
    latestRef,
    organized,
    focusLater,
    update,
  });

  // 入力。区切り (空行 2 つ) が入ったらそこで分け、カーソルを行き先へ (配列の変換は board-ops)
  const change = (key: string, value: string, cursor: number) => {
    const r = changeSection(latestRef.current, key, value, cursor);
    if (!r) return;
    if (r.focus) focusLater(r.focus.key, r.focus.offset);
    update(r.next);
    // 末尾に新しいセクションができてそこへ移るなら、その冒頭を画面の上端に持ってくる
    if (r.revealLast) revealLast();
  };

  // i 番目と i+1 番目をつなげ、カーソルをつなぎ目に置く
  const merge = (i: number, focused: string) => {
    const r = mergeSections(latestRef.current, i, focused);
    if (!r) return;
    focusLater(r.focus.key, r.focus.offset);
    update(r.next);
  };

  // 隣のセクションとの結合 / 移動。境界にいるかの判定 (選択なし・IME 変換中でない・先頭 / 末尾 / 表示上の
  // 最初 / 最後の行) は SectionEditor が行い、ここは隣が無ければ何もしない (↑↓ は false を返して通常の動きに任せる)
  const backspaceAtStart = (key: string) => {
    const i = indexOf(key);
    if (i > 0) merge(i - 1, key);
  };
  const deleteAtEnd = (key: string) => {
    const i = indexOf(key);
    if (i >= 0 && latestRef.current[i + 1]) merge(i, key);
  };
  const arrowUpAtFirstLine = (key: string) => {
    const prev = latestRef.current[indexOf(key) - 1];
    if (!prev) return false;
    focus(prev.key, prev.content.length);
    return true;
  };
  const arrowDownAtLastLine = (key: string) => {
    const i = indexOf(key);
    const next = i >= 0 ? latestRef.current[i + 1] : undefined;
    if (!next) return false;
    focus(next.key, 0);
    return true;
  };
  // Esc でフォーカスしたセクション表示 (MarkdownView) からの ↑↓: 隣のセクションの表示へフォーカスを移す
  // (PC のキーボード操作。Enter で編集に戻れる)。空のセクションは表示要素が無いので飛ばす
  const focusViewFrom = (key: string, dir: -1 | 1) => {
    const cur = latestRef.current;
    const i = cur.findIndex((s) => s.key === key);
    if (i < 0) return false;
    for (let j = i + dir; j >= 0 && j < cur.length; j += dir) {
      const s = cur[j]!;
      if (s.content.trim() === "") continue;
      focusView(s.key);
      return true;
    }
    return false;
  };
  // Esc: エディタを Markdown 表示に戻し、描画後にその表示へフォーカスを移す。
  // CodeMirror の blur 通知 (onBlur) は 10ms 遅れて届くので待たない (その間に別の描画 (自動保存の状態表示など) が
  // 入ると useSectionFocus の layout effect が pendingViewFocusRef を消費してしまい、フォーカスが移らない)
  const exitEditing = (key: string) => {
    pendingViewFocusRef.current = key;
    setEditingKey((k) => (k === key ? null : k));
  };

  // 「セクションを追加」ボタン (PC 幅ではヘッダー、狭い画面では右下固定):
  // 空のセクションを末尾に足してカーソルを置く (冒頭を画面の上端へ)。
  // 末尾が既に空ならそれを使う (空のセクションは保存されないので、増やしても意味がない。appendSection)
  const addSection = () => {
    // まとめ表示中ならタイムラインへ戻ってから (エディタはタイムラインにしか無い)
    setViewMode("timeline");
    const { next, focus: target } = appendSection(latestRef.current);
    if (next) {
      focusLater(target.key, target.offset);
      update(next);
    } else {
      focus(target.key, target.offset);
    }
    revealLast();
  };

  // ヘッダーの「セクションを追加」ボタン (AddSectionButton) に操作を渡す (編集できるときだけ。離れたら消す)。
  // addSection は毎描画作り直されるが、ref と安定な setter しか触らないので初回のもので足りる
  useEffect(() => {
    if (readOnly) return;
    publishBoardActions({ addSection });
    return () => publishBoardActions(null);
    // readOnly はマウント後に変わらない (変わるときは key で作り直される)
  }, [readOnly]);

  // ヘッダーの表示切替 (ViewToggle) を出す (板を表示している間だけ)。
  // まとめは閲覧にも役立つので、閲覧のみ (readOnly) でも出す
  useEffect(() => {
    publishViewToggle(true);
    return () => publishViewToggle(false);
  }, []);

  // 最後のセクションより下の空き領域 (やセクションの外枠の余白) をクリックしたら末尾にカーソルを置く
  // (画面全体が書ける場所に見えるように)。
  // mousedown を止めて、編集中のエディタがクリックの途中で blur (→ Markdown 表示) しないようにする
  const isBlank = (e: MouseEvent<HTMLDivElement>) =>
    e.target === e.currentTarget || (e.target as HTMLElement).hasAttribute("data-section");
  const focusEnd = (e: MouseEvent<HTMLDivElement>) => {
    if (readOnly || !isBlank(e)) return;
    const last = latestRef.current.at(-1);
    // 末尾へ飛ぶ操作なので、セクションをタップして編集に移るときと同じ置き方にする
    if (last) focus(last.key, last.content.length, "top");
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
    if (editingKeyRef.current === key && anchor) pendingAnchorRef.current = { key, anchor };
    setEditingKey((k) => (k === key ? null : k));
  };

  // 各セクション (SectionRow) への操作
  const handlers: SectionHandlers = {
    change,
    startEditing: setEditingKey,
    blur: onBlur,
    exitEditing,
    backspaceAtStart,
    deleteAtEnd,
    arrowUpAtFirstLine,
    arrowDownAtLastLine,
    // 編集に移るときは、その場所を画面の上のほうに出す (下のほうをタップしたとき、
    // キーボードの上に書く場所が残らないため。まとめ表示からの移動と同じ扱い)
    edit: (key, pos) => focus(key, pos, "top"),
    navigateView: focusViewFrom,
    screenshot,
    remove: removeSection,
  };
  const refs: SectionRefs = { boxes: boxesRef, views: viewsRef, editors: elementsRef };
  // セクションが 1 つだけのときのエディタのプレースホルダ (書き方の案内)
  const placeholder = [
    "ここに書く…",
    `セクションごとに ${ttlDays} 日で消えます`,
    "空行 2 つで次のセクションへ",
    "Markdown が使えます (# 見出し、- 箇条書き)",
    "Tab でインデント、Esc で編集をやめる",
  ].join("\n");
  // 各セクションに書ける文字数: 板全体の上限 (保存するのは空でないセクションを区切りで連結したもの。boardLength) から、
  // 他の空でないセクションの文字数と、それらとの区切りのぶんを引く
  const filled = sections.filter((s) => s.content !== "");
  const filledLength = filled.reduce((n, s) => n + s.content.length, 0);
  const maxLengthOf = (s: (typeof sections)[number]) => {
    const own = s.content !== "";
    const others = filled.length - (own ? 1 : 0);
    const othersLength = filledLength - s.content.length;
    return BOARD_MAX_LENGTH - othersLength - others * SECTION_SEPARATOR.length;
  };

  return (
    <Stack gap="xs" style={{ flex: 1 }}>
      {organized ? (
        /* まとめ表示 (#37): 見出しごとに連結した閲覧用ビュー。クリックでその場所の編集へ
           (タイムラインに切り替えてカーソルを置く) */
        <OrganizedView
          sections={sections}
          readOnly={readOnly}
          onJump={(key, pos) => {
            setViewMode("timeline");
            // まとめとタイムラインでは並びも高さも別物なので、見ていた高さを保っても意味が無い。
            // 「そこへ飛ぶ」操作として、その場所を画面の上のほうに出す
            focus(key, pos, "top");
          }}
          onDelete={removeGroup}
        />
      ) : (
        <Box
          style={{ flex: 1, cursor: readOnly ? undefined : "text" }}
          onClick={focusEnd}
          onMouseDown={keepFocus}
        >
          {sections.map((s, i) => (
            <SectionRow
              key={s.key}
              section={s}
              index={i}
              editing={s.key === editingKey}
              readOnly={readOnly}
              fillScreen={i === sections.length - 1 && sections.length > 1}
              maxLength={maxLengthOf(s)}
              placeholder={sections.length === 1 ? placeholder : undefined}
              handlers={handlers}
              refs={refs}
            />
          ))}
        </Box>
      )}

      {/* 右下固定の追加ボタンの下に本文が隠れないよう、スクロールの終端に余白を足しておく */}
      <Box h={64} />

      {/* セクションを追加 (右下固定。狭い画面のみ: PC 幅 (sm 以上) ではヘッダーの AddSectionButton)。
          区切りの入力 (空行 2 つ) を知らなくても増やせるように。
          固定表示なので、板が長くてもスクロールせずに押せる。
          まとめ表示 (閲覧用) では出さない (スクロール中の誤タップで急にタイムライン + キーボードに
          切り替わらないように。追加したいときはヘッダーで切り替えるか、PC 幅ならヘッダーのボタンで) */}
      {!readOnly && !organized && (
        <Affix
          hiddenFrom="sm"
          position={{
            bottom: `calc(16px + env(safe-area-inset-bottom) + ${keyboardInset}px)`,
            right: affixInset("right"),
          }}
        >
          <Tooltip label="セクションを追加" withArrow>
            <ActionIcon
              size="xl"
              radius="xl"
              aria-label="セクションを追加"
              style={{ boxShadow: "var(--mantine-shadow-md)" }}
              onMouseDown={keepEditorFocus}
              onClick={addSection}
            >
              <PlusIcon size={22} />
            </ActionIcon>
          </Tooltip>
        </Affix>
      )}

      {/* 削除の取り消し (左下角。PwaUpdateBanner はこの上、右下は追加ボタン) */}
      {deleted && (
        <BottomLeftNotice title={deleted.title} onClose={cancelUndo}>
          <Button size="xs" mt="xs" variant="default" onClick={undoDelete}>
            元に戻す
          </Button>
        </BottomLeftNotice>
      )}
    </Stack>
  );
}
