import {
  ActionIcon,
  Affix,
  Box,
  Button,
  CloseButton,
  Divider,
  Group,
  Notification,
  Stack,
  Tooltip,
} from "@mantine/core";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MEMO_TTL_DAYS } from "@worker/memo/constants";
import { affixInset } from "@/lib/affix";
import { publishBoardActions } from "@/lib/board-actions";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import type { BoardSection } from "@/lib/board";
import { appendSection, changeSection, mergeSections } from "@/lib/board-ops";
import { publishViewToggle, setViewMode, useViewMode } from "@/lib/view-mode";
import { PlusIcon } from "@/components/AddSectionButton";
import { MarkdownView } from "@/components/MarkdownView";
import { OrganizedView } from "@/components/OrganizedView";
import { SectionActions } from "@/components/SectionActions";
import { type EditAnchor, SectionEditor } from "@/components/SectionEditor";
import { useBoardSections } from "@/lib/use-board-sections";
import { useSectionFocus } from "@/lib/use-section-focus";
import { useUndoableDelete } from "@/lib/use-undoable-delete";
import {
  copySectionText,
  deliverImage,
  renderSectionImage,
} from "@/lib/section-export";

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
  const { sections, latestRef, update } = useBoardSections({ initial, userId, readOnly });

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

  const indexOf = (key: string) =>
    latestRef.current.findIndex((s) => s.key === key);

  const { deleted, cancelUndo, removeSection, removeGroup, undoDelete } =
    useUndoableDelete({ latestRef, organized, focusLater, update });

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
  const backspaceAtStart = (i: number) => {
    if (latestRef.current[i - 1]) merge(i - 1, latestRef.current[i]!.key);
  };
  const deleteAtEnd = (i: number) => {
    const cur = latestRef.current;
    if (cur[i + 1]) merge(i, cur[i]!.key);
  };
  const arrowUpAtFirstLine = (i: number) => {
    const prev = latestRef.current[i - 1];
    if (!prev) return false;
    focus(prev.key, prev.content.length);
    return true;
  };
  const arrowDownAtLastLine = (i: number) => {
    const next = latestRef.current[i + 1];
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
    e.target === e.currentTarget ||
    (e.target as HTMLElement).hasAttribute("data-section");
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
    if (editingKeyRef.current === key && anchor)
      pendingAnchorRef.current = { key, anchor };
    setEditingKey((k) => (k === key ? null : k));
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
          <Box
            key={s.key}
            data-section
            ref={(el) => {
              if (el) boxesRef.current.set(s.key, el);
              else boxesRef.current.delete(s.key);
            }}
            style={{
              // scrollIntoView で冒頭を合わせるとき、固定ヘッダーと本文の余白のぶんだけ下げる (Main の padding-top と同じ)
              scrollMarginTop:
                "calc(var(--app-shell-header-offset, 0rem) + var(--app-shell-padding))",
              // ↑ でのフォーカス移動 (focusView) は nearest で下端に合わせることがある。ぴったりに合うと
              // フォーカスリング (outline 2px + offset 4px。MarkdownView) が画面の外に出るので、そのぶん余白を残す
              scrollMarginBottom: 12,
              // 最後のセクションは短くても冒頭が画面の上端まで来られるよう、画面 1 つ分の高さを確保する
              // (1 つしか無いときは外枠が flex で画面いっぱいに広がるので不要。終端の余白のぶんは少し余る)
              minHeight:
                i === sections.length - 1 && sections.length > 1
                  ? "calc(100dvh - var(--app-shell-header-offset, 0rem) - var(--app-shell-padding))"
                  : undefined,
            }}
          >
            {/* 区切り: ラベルは線の中 (左)、コピー / スクショ / 削除は線の外の右端 */}
            <Group gap="md" wrap="nowrap" mt={i === 0 ? 0 : "md"} mb="xs">
              <Divider
                labelPosition="left"
                style={{ flex: 1 }}
                // 未保存のセクションだけラベルを出す (保存済みはラベルが無いほうが線がすっきりする)
                label={s.expiresAt === null ? "新しいセクション" : undefined}
              />
              {s.content.trim() !== "" && (
                <SectionActions
                  subject={`セクション ${i + 1}`}
                  onCopy={() => copySectionText(s.content)}
                  onScreenshot={() => screenshot(s.key)}
                />
              )}
              {!readOnly && (
                <Tooltip label="削除" withArrow>
                  <CloseButton
                    size="xs"
                    c="red"
                    aria-label={`セクション ${i + 1} を削除`}
                    // 編集中のエディタを blur させない (blur でレイアウトが動くとクリックが外れる)
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => removeSection(s.key)}
                  />
                </Tooltip>
              )}
            </Group>
            {(readOnly || s.key !== editingKey) && s.content.trim() !== "" ? (
              <MarkdownView
                content={s.content}
                aria-label={`セクション ${i + 1}`}
                /* 編集に移るときは、その場所を画面の上のほうに出す (下のほうをタップしたとき、
                   キーボードの上に書く場所が残らないため。まとめ表示からの移動と同じ扱い) */
                onEdit={readOnly ? undefined : (pos) => focus(s.key, pos, "top")}
                onNavigate={
                  readOnly ? undefined : (dir) => focusViewFrom(s.key, dir)
                }
                ref={(el) => {
                  if (el) viewsRef.current.set(s.key, el);
                  else viewsRef.current.delete(s.key);
                }}
              />
            ) : (
              <SectionEditor
                // Tab がインデントに使われて外へ出ないので、抜け方 (Esc) を読み上げでも案内する
                // (MarkdownView の「(Enter で編集)」と対)
                aria-label={`セクション ${i + 1} (Esc で編集をやめる)`}
                placeholder={
                  sections.length === 1
                    ? [
                        "ここに書く…",
                        `セクションごとに ${ttlDays} 日で消えます`,
                        "空行 2 つで次のセクションへ",
                        "Markdown が使えます (# 見出し、- 箇条書き)",
                        "Tab でインデント、Esc で編集をやめる",
                      ].join("\n")
                    : undefined
                }
                value={s.content}
                onChange={(value, cursor) =>
                  change(s.key, value, cursor)
                }
                onFocus={() => setEditingKey(s.key)}
                onBlur={(anchor) => onBlur(s.key, anchor)}
                onBackspaceAtStart={() => backspaceAtStart(indexOf(s.key))}
                onDeleteAtEnd={() => deleteAtEnd(indexOf(s.key))}
                onArrowUpAtFirstLine={() => arrowUpAtFirstLine(indexOf(s.key))}
                onArrowDownAtLastLine={() =>
                  arrowDownAtLastLine(indexOf(s.key))
                }
                onEscape={() => exitEditing(s.key)}
                readOnly={readOnly}
                ref={(editor) => {
                  if (editor) elementsRef.current.set(s.key, editor);
                  else elementsRef.current.delete(s.key);
                }}
              />
            )}
          </Box>
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
              // 編集中のエディタを blur させない (blur でレイアウトが動くとクリックが外れる。削除ボタンと同じ)
              onMouseDown={(e) => e.preventDefault()}
              onClick={addSection}
            >
              <PlusIcon size={22} />
            </ActionIcon>
          </Tooltip>
        </Affix>
      )}

      {/* 削除の取り消し (左下角。PwaUpdateBanner はこの上、右下は追加ボタン) */}
      {deleted && (
        <Affix
          position={{
            bottom: "calc(16px + env(safe-area-inset-bottom))",
            left: affixInset("left"),
          }}
        >
          <Notification
            title={deleted.title}
            withBorder
            onClose={cancelUndo}
            closeButtonProps={{ "aria-label": "閉じる" }}
          >
            <Button size="xs" mt="xs" variant="default" onClick={undoDelete}>
              元に戻す
            </Button>
          </Notification>
        </Affix>
      )}
    </Stack>
  );
}
