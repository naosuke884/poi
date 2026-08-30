import type { Element, Root } from "hast";
import type { Plugin } from "unified";

/**
 * Markdown 表示のクリック位置から、元の Markdown テキストの位置 (エディタでカーソルを置く場所) を求める。
 *
 * 表示 (HTML) と元テキストは 1 対 1 ではない (`# ` や `- ` は消え、`<url>` は `<>` が消える) ので、
 * 見た目の座標をそのままエディタに渡すのではなく、パーサーが持っている元テキストの位置を使う:
 * 1. rehypeSourcePositions で各要素に元テキストの範囲 (data-pos="start-end") を付けておく
 * 2. クリックしたテキストノードとその中のオフセット (caretPositionFromPoint) から、その要素の範囲の中で
 *    テキストノードの文字列を順に探して位置を確定する (sourceOffsetAt)
 * 表示上のテキストは元テキストにそのまま含まれている (有効な記法が少なく、文字を変える記法は無効) のでこれで足りる
 */

/** 各要素に元テキストの範囲を data-pos="start-end" (文字列の index) として付ける rehype プラグイン */
export const rehypeSourcePositions: Plugin<[], Root> = () => (tree) => {
  const visit = (node: Root | Element) => {
    for (const child of node.children) {
      if (child.type !== "element") continue;
      const start = child.position?.start.offset;
      const end = child.position?.end.offset;
      if (start !== undefined && end !== undefined) child.properties.dataPos = `${start}-${end}`;
      visit(child);
    }
  };
  visit(tree);
};

/**
 * クリックしたテキストノード (node) の offset 文字目に対応する、元テキスト (source) の位置。
 * 対応が取れなければ null (呼び出し側は末尾などにフォールバックする)。
 * node は data-pos を持つ要素の中にあること。同じ文字列が繰り返されていても、要素内のテキストノードを
 * 文書順に前から順番に探すので正しい方に当たる
 */
export function sourceOffsetAt(node: Node, offset: number, source: string): number | null {
  const owner = (node instanceof Element ? node : node.parentElement)?.closest("[data-pos]");
  if (!owner) return null;
  const [start, end] = owner.getAttribute("data-pos")!.split("-").map(Number);
  if (start === undefined || end === undefined || Number.isNaN(start) || Number.isNaN(end)) return null;
  // 要素そのものに当たった (テキストの外: offset は子ノードの番号) ときは、その前にある本文テキストの終わり
  if (!(node instanceof Text)) {
    for (let i = offset - 1; i >= 0; i--) {
      const t = lastTextNode(node.childNodes[i]!);
      if (t) return sourceOffsetAt(t, t.data.length, source);
    }
    return start;
  }
  if (isFormatting(node)) return null;
  const region = source.slice(start, end);
  let cursor = 0;
  const walker = owner.ownerDocument.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    if (isFormatting(t)) continue;
    const i = region.indexOf(t.data, cursor);
    if (i < 0) return null;
    if (t === node) return start + i + Math.min(offset, t.data.length);
    cursor = i + t.data.length;
  }
  return null;
}

// react-markdown がブロック要素の間に入れる整形用の改行 (元テキストの範囲の外にあることがある)
const isFormatting = (t: Text) => t.data.trim() === "";

/** node の中 (node 自身を含む) で最後の本文テキストノード */
function lastTextNode(node: Node): Text | null {
  if (node instanceof Text) return isFormatting(node) ? null : node;
  for (let i = node.childNodes.length - 1; i >= 0; i--) {
    const t = lastTextNode(node.childNodes[i]!);
    if (t) return t;
  }
  return null;
}

/** 画面上の点 (clientX / clientY) に対応する元テキストの位置。root の外や対応が取れないときは null */
export function sourceOffsetAtPoint(root: HTMLElement, x: number, y: number, source: string): number | null {
  const doc = root.ownerDocument;
  let node: Node | null = null;
  let offset = 0;
  if (typeof doc.caretPositionFromPoint === "function") {
    const caret = doc.caretPositionFromPoint(x, y);
    if (caret) ({ offsetNode: node, offset } = caret);
  } else if (typeof doc.caretRangeFromPoint === "function") {
    // Safari (caretPositionFromPoint が無い版)
    const range = doc.caretRangeFromPoint(x, y);
    if (range) ({ startContainer: node, startOffset: offset } = range);
  }
  if (!node || !root.contains(node)) return null;
  return sourceOffsetAt(node, offset, source);
}
