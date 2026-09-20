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
  const owner = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>("[data-pos]");
  if (!owner) return null;
  const range = posRange(owner);
  if (!range) return null;
  const [start, end] = range;
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

/** 要素の data-pos="start-end" を読んだ元テキストの範囲 (無い・壊れているときは null) */
function posRange(el: HTMLElement): [start: number, end: number] | null {
  const [start, end] = (el.getAttribute("data-pos") ?? "").split("-").map(Number);
  if (start === undefined || end === undefined || Number.isNaN(start) || Number.isNaN(end)) return null;
  return [start, end];
}

/** data-pos を持つ要素とその範囲 */
type Owner = { el: HTMLElement; start: number; end: number };

/**
 * 元テキストの位置 pos を範囲に含む要素のうち、いちばん内側 (範囲がいちばん狭い) のもの。
 * どれにも入らない (ブロックの間の空行など) ときは、範囲がいちばん近い要素で代用する
 */
function ownerAtSourceOffset(root: HTMLElement, pos: number): Owner | null {
  let best: Owner | null = null;
  let fallback: Owner | null = null;
  const distance = (o: Owner) => Math.max(o.start - pos, pos - o.end, 0);
  for (const el of root.querySelectorAll<HTMLElement>("[data-pos]")) {
    const range = posRange(el);
    if (!range) continue;
    const [start, end] = range;
    const owner = { el, start, end };
    if (pos < start || pos > end) {
      if (!fallback || distance(owner) < distance(fallback)) fallback = owner;
      continue;
    }
    if (!best || end - start < best.end - best.start) best = owner;
  }
  return best ?? fallback;
}

/**
 * 元テキストの位置 pos が Markdown 表示のどの高さに描かれているか (client 座標の上端)。
 * sourceOffsetAt の逆向き: pos を含む要素を選び、その中のテキストノードを文書順に元テキストと
 * 突き合わせて該当する文字を探す (同じ手順なので、同じ文字列が繰り返されていても同じところに当たる)。
 * 文字まで辿れなければ要素の上端、表示が空 (data-pos がひとつも無い) なら null。
 * 同じ内容でもソースのまま (エディタ) とレンダリング後 (表示) では高さが違うので、
 * 編集の切り替えで見ていた場所を同じ高さに保つのに使う
 */
export function clientTopAtSourceOffset(root: HTMLElement, source: string, pos: number): number | null {
  const owner = ownerAtSourceOffset(root, pos);
  if (!owner) return null;
  const region = source.slice(owner.start, owner.end);
  let cursor = 0;
  // pos に届かないまま終わったら、最後に見たテキストノードの末尾で代用する (範囲の末尾の位置など)
  let found: { node: Text; offset: number } | null = null;
  const walker = owner.el.ownerDocument.createTreeWalker(owner.el, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    if (isFormatting(t)) continue;
    const i = region.indexOf(t.data, cursor);
    if (i < 0) break;
    const from = owner.start + i;
    if (pos <= from + t.data.length) {
      found = { node: t, offset: Math.max(0, pos - from) };
      break;
    }
    found = { node: t, offset: t.data.length };
    cursor = i + t.data.length;
  }
  return (found && charTop(found.node, found.offset)) ?? owner.el.getBoundingClientRect().top;
}

/** テキストノードの offset 文字目が描かれている行の上端 (矩形が取れなければ null) */
function charTop(node: Text, offset: number): number | null {
  // 潰れた範囲は矩形が取れないことがあるので 1 文字ぶんの幅を持たせる (末尾なら手前の 1 文字)
  const at = Math.min(offset, Math.max(0, node.data.length - 1));
  const range = node.ownerDocument.createRange();
  range.setStart(node, at);
  range.setEnd(node, Math.min(at + 1, node.data.length));
  const rect = range.getBoundingClientRect();
  return rect.height > 0 ? rect.top : null;
}
