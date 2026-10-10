import { readFileSync } from "node:fs";

import { PAGE_PATHS } from "@shared/site";
import { describe, expect, it } from "vite-plus/test";

import { hasSessionCookie, PAGE_REDIRECTS, resolvePage } from "./pages";

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

  it("/sitemap.xml はサイトマップとして返す (issue #149)", () => {
    expect(resolvePage("/sitemap.xml")).toEqual({ kind: "sitemap" });
  });

  it("/login は / へ転送する (issue #142)", () => {
    expect(resolvePage("/login")).toEqual({ kind: "redirect", location: "/", status: 301 });
    expect(resolvePage("/login", "?a=1")).toEqual({
      kind: "redirect",
      location: "/?a=1",
      status: 301,
    });
  });

  it("末尾のスラッシュは外した URL へ転送する", () => {
    expect(resolvePage("/terms/", "?a=1")).toEqual({
      kind: "redirect",
      location: "/terms?a=1",
      status: 301,
    });
    expect(resolvePage("//")).toEqual({ kind: "redirect", location: "/", status: 301 });
    expect(resolvePage("/board/")).toEqual({ kind: "redirect", location: "/board", status: 301 });
  });

  it("ログイン済みならトップは板へ一時的に転送し、ほかのページはそのまま (issue #156)", () => {
    expect(resolvePage("/", "?a=1", true)).toEqual({
      kind: "redirect",
      location: "/board?a=1",
      status: 302,
    });
    expect(resolvePage("/", "", false)).toEqual({ kind: "page", status: 200 });
    expect(resolvePage("/terms", "", true)).toEqual({ kind: "page", status: 200 });
    expect(resolvePage("/board", "", true)).toEqual({ kind: "page", status: 200 });
  });

  it("src/routes のルートは、どれもページか転送先として登録してある", () => {
    // ルートを足したのに PAGE_PATHS に足し忘れると、そのページが 404 で返ってしまう
    const routeTree = readFileSync("src/routeTree.gen.ts", "utf8");
    // ディレクトリの index (board/index.tsx) は fullPath の末尾に / が付くが、URL には付かない
    const fullPaths = [...routeTree.matchAll(/^\s+fullPath: '([^']+)'/gm)].map(([, p]) =>
      p!.length > 1 ? p!.replace(/\/$/, "") : p,
    );
    expect(fullPaths.length).toBeGreaterThan(0);
    const known = [...PAGE_PATHS, ...Object.keys(PAGE_REDIRECTS)];
    expect(known.toSorted()).toEqual(fullPaths.toSorted());
  });
});

describe("hasSessionCookie", () => {
  it("Better Auth のセッション Cookie (https では __Secure- 付き) があれば true", () => {
    expect(hasSessionCookie("better-auth.session_token=abc.def")).toBe(true);
    expect(hasSessionCookie("x=1; __Secure-better-auth.session_token=abc")).toBe(true);
  });

  it("無い・空・multiSession の Cookie だけなら false", () => {
    expect(hasSessionCookie(null)).toBe(false);
    expect(hasSessionCookie("x=1")).toBe(false);
    expect(hasSessionCookie("better-auth.session_token=")).toBe(false);
    expect(hasSessionCookie("better-auth.session_token_multi-abc=abc")).toBe(false);
    expect(hasSessionCookie("my-better-auth.session_token=abc")).toBe(false);
  });
});
