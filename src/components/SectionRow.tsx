import { Box, CloseButton, Divider, Group, Tooltip } from "@mantine/core";
import type { RefObject } from "react";
import type { EditableSection } from "@/lib/board";
import { copySectionText } from "@/lib/section-export";
import { MarkdownView } from "@/components/MarkdownView";
import { SectionActions } from "@/components/SectionActions";
import {
  type EditAnchor,
  SectionEditor,
  type SectionEditorHandle,
} from "@/components/SectionEditor";

/**
 * セクションへの操作 (Board が持つ)。どれも対象のセクションの key を受け取る。
 * エディタの境界 (先頭 / 末尾 / 最初 / 最後の行) の判定は SectionEditor が行い、ここは何をするかだけ
 */
export type SectionHandlers = {
  /** 入力。区切りが入ったら分ける */
  change(key: string, value: string, cursor: number): void;
  /** エディタにフォーカスが入った */
  startEditing(key: string): void;
  /** エディタからフォーカスが外れた */
  blur(key: string, anchor: EditAnchor | null): void;
  /** Esc で編集をやめた */
  exitEditing(key: string): void;
  /** 先頭で Backspace (前と結合) / 末尾で Delete (次と結合) */
  backspaceAtStart(key: string): void;
  deleteAtEnd(key: string): void;
  /** 最初 / 最後の行で ↑↓ (隣へ移る)。移る先が無ければ false */
  arrowUpAtFirstLine(key: string): boolean;
  arrowDownAtLastLine(key: string): boolean;
  /** Markdown 表示のクリック / Enter で、その位置の編集へ */
  edit(key: string, pos: number): void;
  /** Markdown 表示にフォーカスがあるときの ↑↓ (隣の表示へ)。移る先が無ければ false */
  navigateView(key: string, dir: -1 | 1): boolean;
  /** 画像にして届ける (クリップボードかダウンロードか) */
  screenshot(key: string): Promise<"clipboard" | "download">;
  remove(key: string): void;
};

/** key → 要素の控え (useSectionFocus)。描画した要素をここに登録する */
export type SectionRefs = {
  boxes: RefObject<Map<string, HTMLDivElement>>;
  views: RefObject<Map<string, HTMLDivElement>>;
  editors: RefObject<Map<string, SectionEditorHandle>>;
};

/** Map の ref に key で登録 / 解除する ref コールバック */
function register<T>(map: RefObject<Map<string, T>>, key: string) {
  return (el: T | null) => {
    if (el) map.current.set(key, el);
    else map.current.delete(key);
  };
}

/**
 * 板の 1 セクション: 区切り線 (ラベル + コピー / スクショ / 削除) と、本文。
 * 本文は編集中ならエディタ (SectionEditor)、それ以外は Markdown 表示 (空のセクションは常にエディタ)
 */
export function SectionRow({
  section: s,
  index: i,
  editing,
  readOnly,
  fillScreen,
  placeholder,
  handlers: h,
  refs,
}: {
  section: EditableSection;
  index: number;
  editing: boolean;
  readOnly: boolean;
  /** 画面 1 つ分の高さを確保する (最後のセクション) */
  fillScreen: boolean;
  /** エディタのプレースホルダ (セクションが 1 つだけのとき) */
  placeholder: string | undefined;
  handlers: SectionHandlers;
  refs: SectionRefs;
}) {
  const label = `セクション ${i + 1}`;
  const empty = s.content.trim() === "";
  return (
    <Box
      data-section
      ref={register(refs.boxes, s.key)}
      style={{
        // scrollIntoView で冒頭を合わせるとき、固定ヘッダーと本文の余白のぶんだけ下げる (Main の padding-top と同じ)
        scrollMarginTop:
          "calc(var(--app-shell-header-offset, 0rem) + var(--app-shell-padding))",
        // ↑ でのフォーカス移動 (focusView) は nearest で下端に合わせることがある。ぴったりに合うと
        // フォーカスリング (outline 2px + offset 4px。MarkdownView) が画面の外に出るので、そのぶん余白を残す
        scrollMarginBottom: 12,
        // 最後のセクションは短くても冒頭が画面の上端まで来られるよう、画面 1 つ分の高さを確保する
        // (1 つしか無いときは外枠が flex で画面いっぱいに広がるので不要。終端の余白のぶんは少し余る)
        minHeight: fillScreen
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
        {!empty && (
          <SectionActions
            subject={label}
            onCopy={() => copySectionText(s.content)}
            onScreenshot={() => h.screenshot(s.key)}
          />
        )}
        {!readOnly && (
          <Tooltip label="削除" withArrow>
            <CloseButton
              size="xs"
              c="red"
              aria-label={`${label} を削除`}
              // 編集中のエディタを blur させない (blur でレイアウトが動くとクリックが外れる)
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => h.remove(s.key)}
            />
          </Tooltip>
        )}
      </Group>
      {(readOnly || !editing) && !empty ? (
        <MarkdownView
          content={s.content}
          aria-label={label}
          onEdit={readOnly ? undefined : (pos) => h.edit(s.key, pos)}
          onNavigate={readOnly ? undefined : (dir) => h.navigateView(s.key, dir)}
          ref={register(refs.views, s.key)}
        />
      ) : (
        <SectionEditor
          // Tab がインデントに使われて外へ出ないので、抜け方 (Esc) を読み上げでも案内する
          // (MarkdownView の「(Enter で編集)」と対)
          aria-label={`${label} (Esc で編集をやめる)`}
          placeholder={placeholder}
          value={s.content}
          onChange={(value, cursor) => h.change(s.key, value, cursor)}
          onFocus={() => h.startEditing(s.key)}
          onBlur={(anchor) => h.blur(s.key, anchor)}
          onBackspaceAtStart={() => h.backspaceAtStart(s.key)}
          onDeleteAtEnd={() => h.deleteAtEnd(s.key)}
          onArrowUpAtFirstLine={() => h.arrowUpAtFirstLine(s.key)}
          onArrowDownAtLastLine={() => h.arrowDownAtLastLine(s.key)}
          onEscape={() => h.exitEditing(s.key)}
          readOnly={readOnly}
          ref={register(refs.editors, s.key)}
        />
      )}
    </Box>
  );
}
