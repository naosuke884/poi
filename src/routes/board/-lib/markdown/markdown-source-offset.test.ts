// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { describe, expect, it } from "vitest";
import { rehypeSourcePositions, sourceOffsetAt } from "./markdown-source-offset";

/** source を react-markdown で描画し (data-pos 付き)、DOM にして返す */
function render(source: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    createElement(Markdown, { rehypePlugins: [rehypeSourcePositions] }, source),
  );
  return root;
}

/** 表示上の文字列 text の中の offset 文字目 (を含むテキストノード) から元テキストの位置を引く */
function offsetOf(root: HTMLElement, text: string, offset: number, source: string): number | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    if (t.data === text) return sourceOffsetAt(t, offset, source);
  }
  throw new Error(`text not found: ${text}`);
}

describe("sourceOffsetAt", () => {
  it("見出しや項目の記号を飛ばして元テキストの位置に戻す", () => {
    const source = "# 見出し\n\n- 項目";
    const root = render(source);
    expect(offsetOf(root, "見出し", 1, source)).toBe(source.indexOf("出"));
    expect(offsetOf(root, "項目", 2, source)).toBe(source.length);
  });

  it("記号と同じ文字が本文にあっても、記号の中には当たらない", () => {
    const ol = "1. 1";
    expect(offsetOf(render(ol), "1", 0, ol)).toBe(3);
    const ten = "10. 0";
    expect(offsetOf(render(ten), "0", 1, ten)).toBe(5);
  });

  it("同じ文字列が繰り返されていても、クリックした方に当たる", () => {
    const source = "- aa\n- aa";
    const root = render(source);
    const texts = [...root.querySelectorAll("li")].map((li) => li.firstChild as Text);
    expect(sourceOffsetAt(texts[0]!, 1, source)).toBe(3);
    expect(sourceOffsetAt(texts[1]!, 1, source)).toBe(8);
  });

  it("強調の中のテキストも辿れる", () => {
    const source = "前 **太字** 後";
    const root = render(source);
    expect(offsetOf(root, "太字", 1, source)).toBe(source.indexOf("字"));
    expect(offsetOf(root, " 後", 2, source)).toBe(source.length);
  });
});
