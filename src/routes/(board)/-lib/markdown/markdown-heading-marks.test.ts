import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { BOARD_MARKDOWN_DISABLED, remarkDisable } from "./markdown-disable";
import { rehypeHeadingMarks } from "./markdown-heading-marks";

/** MarkdownView と同じ設定で描画した HTML (改行は比べやすいように除く) */
const render = (source: string) =>
  renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, remarkBreaks, [remarkDisable, BOARD_MARKDOWN_DISABLED]],
        rehypePlugins: [rehypeHeadingMarks],
      },
      source,
    ),
  ).replaceAll("\n", "");

describe("rehypeHeadingMarks (見出しの 1 行目の折り返し幅をエディタの記号のぶん狭める)", () => {
  it("各レベルの見出しに、エディタで行頭に見える記号をそのまま付ける", () => {
    expect(render("# 見出し")).toBe('<h1 data-heading-mark="# ">見出し</h1>');
    expect(render("本文\n### 見出し\n本文")).toBe(
      '<p>本文</p><h3 data-heading-mark="### ">見出し</h3><p>本文</p>',
    );
    expect(render("###### 見出し")).toBe('<h6 data-heading-mark="###### ">見出し</h6>');
  });

  it("記号の後の空白が複数でも、行頭に空白があっても、エディタと同じ文字列にする", () => {
    expect(render("##   見出し")).toBe('<h2 data-heading-mark="##   ">見出し</h2>');
    expect(render("  ## 見出し")).toBe('<h2 data-heading-mark="  ## ">見出し</h2>');
  });

  it("本文が空の見出しは記号だけ (表示でも 1 行ぶんの高さにするため)", () => {
    expect(render("本文\n##\n本文")).toBe('<p>本文</p><h2 data-heading-mark="##"></h2><p>本文</p>');
  });

  it("行頭に別の記号がある見出し (箇条書きの中) には付けない", () => {
    expect(render("- ## 見出し")).toBe("<ul><li><h2>見出し</h2></li></ul>");
  });

  it("見出しでない行には付けない", () => {
    expect(render("#タグ\n本文")).toBe("<p>#タグ<br/>本文</p>");
  });
});
