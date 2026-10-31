import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vite-plus/test";

import { BOARD_MARKDOWN_DISABLED, remarkDisable } from "./markdown-disable";
import { rehypeLinkLabels } from "./markdown-link-labels";

/** MarkdownView と同じ設定で描画した HTML (改行は比べやすいように除く) */
const render = (source: string) =>
  renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, remarkBreaks, [remarkDisable, BOARD_MARKDOWN_DISABLED]],
        rehypePlugins: [rehypeLinkLabels],
      },
      source,
    ),
  ).replaceAll("\n", "");

/** 1 つ目のリンクの [ドメイン, 残り] の表示 (縮めていなければリンクの文字だけ) */
const label = (source: string) => {
  const html = render(source);
  const host = /<span data-link-host="">(.*?)<\/span>/.exec(html)?.[1];
  const rest = /<span data-link-rest="">(.*?)<\/span>/.exec(html)?.[1];
  if (host === undefined) return /<a [^>]*>(.*?)<\/a>/.exec(html)?.[1];
  return rest === undefined ? [host] : [host, rest];
};

describe("rehypeLinkLabels (URL のリンクをドメインと縮めたパスで見せる)", () => {
  it("リンク先はそのままで、表示の文字だけをドメインと残りに分けて縮める", () => {
    expect(render("見る https://example.com/a/b 後")).toBe(
      '<p>見る <a href="https://example.com/a/b" data-link-label="">' +
        '<span data-link-host="">example.com</span><span data-link-rest="">/a/b</span></a> 後</p>',
    );
  });

  it("https:// と www. を外し、パスが無ければドメインだけにする", () => {
    expect(label("https://www.example.com/")).toEqual(["example.com"]);
    expect(label("www.example.com")).toEqual(["example.com"]);
    expect(label("http://localhost:5173/board")).toEqual(["localhost:5173", "/board"]);
  });

  it("%XX で書かれた日本語は読める文字に戻す", () => {
    expect(label("https://ja.wikipedia.org/wiki/%E6%9D%B1%E4%BA%AC#%E6%AD%B4%E5%8F%B2")).toEqual([
      "ja.wikipedia.org",
      "/wiki/東京#歴史",
    ]);
    expect(label("https://example.com/search?q=%E7%8C%AB+%E7%8A%AC")).toEqual([
      "example.com",
      "/search?q=猫 犬",
    ]);
  });

  it("壊れた %XX はそのまま見せる", () => {
    expect(label("https://example.com/%E3%81")).toEqual(["example.com", "/%E3%81"]);
  });

  it("パスの区切りが 4 つ以上なら、先頭 2 つと最後の 1 つを残して途中を … にする", () => {
    expect(label("https://example.com/a/b/c")).toEqual(["example.com", "/a/b/c"]);
    expect(label("https://github.com/owner/repo/issues/12")).toEqual([
      "github.com",
      "/owner/repo/…/12",
    ]);
  });

  it("追跡用のクエリは見せず、それ以外のクエリは残す", () => {
    expect(label("https://www.youtube.com/watch?v=abc&si=xyz&utm_source=x")).toEqual([
      "youtube.com",
      "/watch?v=abc",
    ]);
    expect(label("https://example.com/?utm_source=x&fbclid=y")).toEqual(["example.com"]);
  });

  it("メールアドレスのリンクは縮めない", () => {
    expect(render("a@example.com")).toBe('<p><a href="mailto:a@example.com">a@example.com</a></p>');
  });
});
