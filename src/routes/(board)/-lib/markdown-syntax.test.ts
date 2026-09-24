import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { BOARD_MARKDOWN_DISABLED, remarkDisable } from "./markdown-disable";
import { LIST_ITEM_RE, parseHeading } from "./markdown-syntax";

/** MarkdownView と同じ設定で 1 行を描画した HTML */
const render = (line: string) =>
  renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      { remarkPlugins: [remarkGfm, remarkBreaks, [remarkDisable, BOARD_MARKDOWN_DISABLED]] },
      line,
    ),
  );

describe("見出しの判定は表示 (micromark) と一致する", () => {
  const lines = [
    "# a",
    "###### a",
    "####### a",
    "#",
    "## ",
    "#a",
    "#\ta",
    "   # a",
    "    # a",
    "\t# a",
    "\t\t## a",
    "  #a",
    "# a ##",
    "# #",
    "- # a",
  ];
  for (const line of lines) {
    it(JSON.stringify(line), () => {
      const h = /^<h([1-6])>(.*?)<\/h\1>$/.exec(render(line));
      const parsed = parseHeading(line);
      expect(parsed === null ? null : { level: parsed.level, text: parsed.text }).toEqual(
        h ? { level: Number(h[1]), text: h[2] } : null,
      );
    });
  }
});

describe("LIST_ITEM_RE", () => {
  it("記号の後に空白がある行だけを項目にする", () => {
    for (const line of ["- a", "\t* a", "+ a", "1. a", "123456789) a", "- "])
      expect(LIST_ITEM_RE.test(line), line).toBe(true);
    for (const line of ["-a", "1.a", "1234567890. a", "a - b", "#"])
      expect(LIST_ITEM_RE.test(line), line).toBe(false);
  });
});
