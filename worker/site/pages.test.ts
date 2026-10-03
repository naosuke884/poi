import { readFileSync } from "node:fs";
import { PAGE_PATHS } from "@shared/site";
import { describe, expect, it } from "vitest";
import { PAGE_REDIRECTS, resolvePage } from "./pages";

describe("resolvePage", () => {
  it("公開しているページは 200", () => {
    for (const path of PAGE_PATHS) expect(resolvePage(path)).toEqual({ kind: "page", status: 200 });
  });

  it("知らないパスは index.html を 404 で返す (issue #141)", () => {
    expect(resolvePage("/nope")).toEqual({ kind: "page", status: 404 });
    expect(resolvePage("/terms/x")).toEqual({ kind: "page", status: 404 });
  });

  it("拡張子付きの知らないパスは HTML を返さない", () => {
    expect(resolvePage("/assets/index-old.js")).toEqual({ kind: "missing" });
    expect(resolvePage("/robots2.txt")).toEqual({ kind: "missing" });
  });

  it("/sitemap.xml は公開ページの一覧から作る (issue #149)", () => {
    expect(resolvePage("/sitemap.xml")).toEqual({ kind: "sitemap" });
  });

  it("/login は / へ転送する (issue #142)", () => {
    expect(resolvePage("/login")).toEqual({ kind: "redirect", location: "/" });
    expect(resolvePage("/login", "?a=1")).toEqual({ kind: "redirect", location: "/?a=1" });
  });

  it("末尾のスラッシュは外した URL へ転送する", () => {
    expect(resolvePage("/terms/", "?a=1")).toEqual({ kind: "redirect", location: "/terms?a=1" });
    expect(resolvePage("//")).toEqual({ kind: "redirect", location: "/" });
  });

  it("src/routes のルートは、どれもページか転送先として登録してある", () => {
    // ルートを足したのに PAGE_PATHS に足し忘れると、そのページが 404 で返ってしまう
    const routeTree = readFileSync("src/routeTree.gen.ts", "utf8");
    const fullPaths = [...routeTree.matchAll(/^\s+fullPath: '([^']+)'/gm)].map(([, p]) => p);
    expect(fullPaths.length).toBeGreaterThan(0);
    const known = [...PAGE_PATHS, ...Object.keys(PAGE_REDIRECTS)];
    expect(known.toSorted()).toEqual(fullPaths.toSorted());
  });
});
