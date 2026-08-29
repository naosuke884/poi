import { Box, Typography } from "@mantine/core";
import type { MouseEvent, Ref } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { BOARD_MARKDOWN_DISABLED, remarkDisable } from "@/lib/markdown-disable";
import classes from "./MarkdownView.module.css";

/**
 * セクションの Markdown レンダリング表示 (編集していないセクション用)。
 * - GFM (チェックボックス・表・打ち消し線・自動リンク) 対応。BOARD_MARKDOWN_DISABLED の記法は無効 (文字のまま表示)。
 *   改行 1 つはそのまま改行として扱う (remark-breaks。メモなので)
 * - HTML は構文ごと無効 (文字のまま表示) なので sanitize は不要
 * - リンクは別タブで開く (同じタブで開くと編集中の板から離れてしまうため)
 * - クリックで編集に切り替えるとき、mousedown では他の Textarea を blur させない (blur で先にレイアウトが
 *   変わるとクリック位置がずれるため。フォーカスの移動は onClick 側が行う)
 * - ref は外側の要素 (スクショはこの要素をそのまま画像にする)
 */
export function MarkdownView({
  content,
  onClick,
  "aria-label": ariaLabel,
  ref,
}: {
  content: string;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  "aria-label"?: string;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <Box
      ref={ref}
      onClick={onClick}
      onMouseDown={onClick ? (e) => e.preventDefault() : undefined}
      aria-label={ariaLabel}
      style={{ cursor: onClick ? "text" : undefined }}
    >
      <Typography className={classes.root} fz="md" lh={1.55}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks, [remarkDisable, BOARD_MARKDOWN_DISABLED]]}
          components={{
            a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          }}
        >
          {content}
        </ReactMarkdown>
      </Typography>
    </Box>
  );
}
