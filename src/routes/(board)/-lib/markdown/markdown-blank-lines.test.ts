import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { rehypeBlankLines } from "./markdown-blank-lines";
import { BOARD_MARKDOWN_DISABLED, remarkDisable } from "./markdown-disable";

/** MarkdownView と同じ設定で描画した HTML (改行は比べやすいように除く) */
const render = (source: string) =>
  renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, remarkBreaks, [remarkDisable, BOARD_MARKDOWN_DISABLED]],
        rehypePlugins: [rehypeBlankLines],
      },
      source,
    ),
  ).replaceAll("\n", "");

describe("rehypeBlankLines (表示の余白をエディタの空行に合わせる。issue #117)", () => {
  it("見出しと段落の間の空行の有無を区別する (HTML だけでは同じになる)", () => {
    expect(render("# 見出し\n本文")).toBe("<h1>見出し</h1><p>本文</p>");
    expect(render("# 見出し\n\n本文")).toBe('<h1>見出し</h1><p data-blank-lines="1">本文</p>');
    expect(render("本文\n## 見出し")).toBe("<p>本文</p><h2>見出し</h2>");
    expect(render("本文\n\n## 見出し")).toBe('<p>本文</p><h2 data-blank-lines="1">見出し</h2>');
  });

  it("段落の中の改行は空行として数えない", () => {
    expect(render("1 行目\n2 行目\n\n次の段落")).toBe(
      '<p>1 行目<br/>2 行目</p><p data-blank-lines="1">次の段落</p>',
    );
  });

  it("セクション先頭の空行も数える", () => {
    expect(render("\n# 見出し")).toBe('<h1 data-blank-lines="1">見出し</h1>');
  });

  it("箇条書きの項目の間の空行は数え、入れ子の最初の要素には付けない", () => {
    expect(render("- 一\n  - 一の一\n- 二\n\n- 三")).toBe(
      "<ul><li><p>一</p><ul><li>一の一</li></ul></li><li><p>二</p></li>" +
        '<li data-blank-lines="1"><p>三</p></li></ul>',
    );
  });
});
