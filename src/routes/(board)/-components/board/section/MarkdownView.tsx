import { Box, Typography } from "@mantine/core";
import type { KeyboardEvent, MouseEvent, Ref } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { BOARD_MARKDOWN_DISABLED, remarkDisable } from "../../../-lib/markdown/markdown-disable";
import {
  rehypeSourcePositions,
  sourceOffsetAtPoint,
} from "../../../-lib/markdown/markdown-source-offset";
import classes from "./MarkdownView.module.css";

/** 空でない選択範囲が el に掛かっているか */
function selectionIntersects(el: Element): boolean {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return false;
  for (let i = 0; i < sel.rangeCount; i++) {
    if (sel.getRangeAt(i).intersectsNode(el)) return true;
  }
  return false;
}

/**
 * セクションの Markdown レンダリング表示 (編集していないセクション用)。
 * - GFM (チェックボックス・表・打ち消し線・自動リンク) 対応。BOARD_MARKDOWN_DISABLED の記法は無効 (文字のまま表示)。
 *   改行 1 つはそのまま改行として扱う (remark-breaks。メモなので)
 * - HTML は構文ごと無効 (文字のまま表示) なので sanitize は不要
 * - リンクは別タブで開く (同じタブで開くと編集中の板から離れてしまうため)
 * - 表は横スクロールする箱で包む (幅広の表でページ全体が横に伸びないように)
 * - onEdit があれば編集に切り替えられる: クリック、または Tab でフォーカスして Enter。
 *   クリックしたときはその場所に対応する元テキストの位置を渡す (src/routes/(board)/-lib/markdown/markdown-source-offset.ts。
 *   対応が取れなければ末尾)。Enter のときは末尾。
 *   ドラッグで文字を選択しただけのときは切り替えない (このセクションに掛かる選択が残っている click は無視。
 *   編集中のエディタの選択は mousedown を止めるので残るが、それは別のセクションなので切り替える)
 * - onNavigate があれば、フォーカス中の ↑↓ で隣のセクションへ移れる (Esc で編集をやめた後のキーボード操作)。
 *   移れたとき (true) だけ既定の動き (ページのスクロール) を止める
 * - 他のセクションのエディタ (CodeMirror) が編集中のときは mousedown でそれを blur させない (blur で先に
 *   レイアウトが変わるとクリック位置がずれるため。フォーカスの移動は onEdit 側が行う)。
 *   編集中のものが無ければ止めない (文字の選択ができるように)
 * - ref は外側の要素 (スクショはこの要素をそのまま画像にする)
 */
export function MarkdownView({
  content,
  onEdit,
  onNavigate,
  "aria-label": ariaLabel,
  ref,
}: {
  content: string;
  /** 編集に切り替える。pos はカーソルを置く元テキストの位置 */
  onEdit?: (pos: number) => void;
  /** ↑ (-1) / ↓ (1) で隣のセクションへフォーカスを移す。移れたら true */
  onNavigate?: (dir: -1 | 1) => boolean;
  "aria-label"?: string;
  ref?: Ref<HTMLDivElement>;
}) {
  const editable = onEdit !== undefined;
  return (
    <Box
      ref={ref}
      className={editable ? classes.editable : undefined}
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      aria-label={editable && ariaLabel ? `${ariaLabel} (Enter で編集)` : ariaLabel}
      onClick={
        editable
          ? (e: MouseEvent<HTMLDivElement>) => {
              // リンクのクリックはリンクに任せる。文字を選択しただけなら編集に切り替えない
              if ((e.target as HTMLElement).closest("a")) return;
              if (selectionIntersects(e.currentTarget)) return;
              onEdit(
                sourceOffsetAtPoint(e.currentTarget, e.clientX, e.clientY, content) ??
                  content.length,
              );
            }
          : undefined
      }
      onKeyDown={
        editable
          ? (e: KeyboardEvent<HTMLDivElement>) => {
              // 中のリンクにフォーカスがあるときは何もしない (リンクの操作に任せる)
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter") {
                e.preventDefault();
                onEdit(content.length);
              } else if (onNavigate && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                if (onNavigate(e.key === "ArrowUp" ? -1 : 1)) e.preventDefault();
              }
            }
          : undefined
      }
      onMouseDown={
        editable
          ? (e) => {
              if (document.activeElement?.closest(".cm-content")) e.preventDefault();
            }
          : undefined
      }
      style={{ cursor: editable ? "text" : undefined }}
    >
      <Typography className={classes.root} fz="md" lh={1.55}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks, [remarkDisable, BOARD_MARKDOWN_DISABLED]]}
          rehypePlugins={[rehypeSourcePositions]}
          components={{
            a: ({ node: _node, ...props }) => (
              <a {...props} target="_blank" rel="noopener noreferrer" />
            ),
            table: ({ node: _node, ...props }) => (
              <div className={classes.tableScroll}>
                <table {...props} />
              </div>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </Typography>
    </Box>
  );
}
