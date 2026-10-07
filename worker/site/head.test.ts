import { readFileSync } from "node:fs";
import { TOP_TITLE } from "@shared/site";
import { describe, expect, it } from "vitest";
import { applyPageHead, subPageHead } from "./head";

const indexHtml = readFileSync("index.html", "utf8");

describe("subPageHead", () => {
  it("利用規約・プライバシーポリシーはページ固有のタイトルと URL (issue #144)", () => {
    expect(subPageHead("/terms")).toMatchObject({
      title: "利用規約 | poi",
      url: "https://poinote.app/terms",
    });
    expect(subPageHead("/privacy")).toMatchObject({
      title: "プライバシーポリシー | poi",
      url: "https://poinote.app/privacy",
    });
  });

  it("板はタイトルがトップのままで、canonical は板 (noindex と食い違わないように。issue #156)", () => {
    expect(subPageHead("/board")).toMatchObject({
      title: TOP_TITLE,
      url: "https://poinote.app/board",
    });
  });

  it("トップ・知らないパス・Object の既定のプロパティ名は書き換えない", () => {
    expect(subPageHead("/")).toBeUndefined();
    expect(subPageHead("/nope")).toBeUndefined();
    expect(subPageHead("constructor")).toBeUndefined();
  });
});

describe("applyPageHead", () => {
  const head = { title: "利用規約 | poi", description: "説明", url: "https://poinote.app/terms" };
  const html = applyPageHead(indexHtml, head);

  it("index.html の title・description・og:*・canonical をすべて置き換える (issue #144)", () => {
    expect(html).toContain("<title>利用規約 | poi</title>");
    expect(html).toContain('<meta name="description" content="説明" />');
    expect(html).toContain('<meta property="og:title" content="利用規約 | poi" />');
    expect(html).toContain('<meta property="og:description" content="説明" />');
    expect(html).toContain('<meta property="og:url" content="https://poinote.app/terms" />');
    expect(html).toContain('<link rel="canonical" href="https://poinote.app/terms" />');
    // 構造化データ (トップのサービスの説明) は置き換えない
    expect(html).toContain('"url": "https://poinote.app/"');
  });

  it("属性値に入れる文字はエスケープする", () => {
    const out = applyPageHead(indexHtml, { ...head, title: 'A & "B" <C>' });
    expect(out).toContain("<title>A &amp; &quot;B&quot; &lt;C&gt;</title>");
  });
});
