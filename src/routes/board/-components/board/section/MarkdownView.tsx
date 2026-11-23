import {
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
  memo,
  type Ref,
  useRef,
} from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { useLinkTitle } from "../../../-lib/link-preview";
import { rehypeBlankLines } from "../../../-lib/markdown/markdown-blank-lines";
import { BOARD_MARKDOWN_DISABLED, remarkDisable } from "../../../-lib/markdown/markdown-disable";
import { rehypeHeadingMarks } from "../../../-lib/markdown/markdown-heading-marks";
import { rehypeLinkLabels } from "../../../-lib/markdown/markdown-link-labels";
import {
  rehypeSourcePositions,
  sourceOffsetAtPoint,
} from "../../../-lib/markdown/markdown-source-offset";

import classes from "./MarkdownView.module.css";

const REMARK_PLUGINS: Options["remarkPlugins"] = [
  remarkGfm,
  remarkBreaks,
  [remarkDisable, BOARD_MARKDOWN_DISABLED],
];
const REHYPE_PLUGINS: Options["rehypePlugins"] = [
  rehypeSourcePositions,
  rehypeBlankLines,
  rehypeHeadingMarks,
  rehypeLinkLabels,
];
const COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => <BoardLink {...props} />,
};

/**
 * 本文のリンク。別タブで開く。URL だけのリンク (rehypeLinkLabels が data-link-label を付けたもの) は、
 * 行き先のページの題名が取れたら、縮めた URL の代わりに題名を見せる (取れるまでと取れなかったときは縮めた URL)。
 * カードにして本文の下に並べないのは、どのリンクの題名かが離れて分かりにくく、リンクの多いメモでは本文より長くなるため
 */
function BoardLink({ children, ...props }: ComponentProps<"a">) {
  const ref = useRef<HTMLAnchorElement>(null);
  const href = props.href ?? "";
  const titled = "data-link-label" in props && /^https?:/i.test(href);
  const title = useLinkTitle(titled ? href : null, ref);
  return (
    <a ref={ref} {...props} target="_blank" rel="noopener noreferrer">
      {title ? <span data-link-title="">{title}</span> : children}
    </a>
  );
}

/**
 * Markdown の解析と描画 (react-markdown)。content が同じなら描き直さない (memo。issue #114):
 * 板は 1 文字の入力ごとに全体を描き直す (Board の setSections) ので、そのたびに編集していない
 * セクションまで全部解析し直すと、セクションが多いときに入力が重くなる。
 * プラグインなどの props はモジュールの定数にして、memo の比較が content だけで決まるようにしている
 */
const MarkdownBody = memo(function MarkdownBody({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={COMPONENTS}
    >
      {content}
    </ReactMarkdown>
  );
});

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
 * - GFM (裸の URL の自動リンク) 対応。BOARD_MARKDOWN_DISABLED の記法は無効 (文字のまま表示)。
 *   改行 1 つはそのまま改行として扱う (remark-breaks。メモなので)
 * - HTML は構文ごと無効 (文字のまま表示) なので sanitize は不要
 * - ブロックの間の余白はエディタと同じく元テキストの空行のぶんだけ (rehypeBlankLines。切り替えで高さが変わらないように)
 * - 見出しの 1 行目は、エディタで見える記号 (`## `) の幅だけ右を空けて折り返す (rehypeHeadingMarks。
 *   狭い画面で長い見出しの行の数が表示と編集で変わらないように)
 * - リンクは別タブで開く (同じタブで開くと編集中の板から離れてしまうため)
 * - URL のリンクはドメインと縮めたパスで見せ、必ず 1 行に収める (rehypeLinkLabels。長い URL が何行にも折り返して
 *   メモが読みにくくなるため)。エディタではソースのまま折り返すので、長い URL があると表示と編集で高さが変わる。
 *   行き先のページの題名が取れたら、題名に置き換える (BoardLink)
 * - onEdit があれば編集に切り替えられる: クリック、または Tab でフォーカスして Enter。
 *   クリックしたときはその場所に対応する元テキストの位置を渡す (src/routes/board/-lib/markdown/markdown-source-offset.ts。
 *   対応が取れなければ末尾)。Enter のときは末尾。
 *   role は button ではなく group: button の中身は読み上げで 1 つのボタン名にまとめられ、中のリンクが
 *   スクリーンリーダーから見えなくなる (操作できる要素の入れ子。axe の nested-interactive)
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
    // ハンドラを付けるのは編集できるとき (role="group") だけだが、条件付きの role は規則からは見えない
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={ref}
      className={editable ? classes.editable : undefined}
      role={editable ? "group" : undefined}
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
    >
      <div className={classes.root}>
        <MarkdownBody content={content} />
      </div>
    </div>
  );
}
