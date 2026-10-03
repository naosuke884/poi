import { PAGE_PATHS, SITE_ORIGIN } from "@shared/site";
import { applyPageHead, subPageHead } from "./head";
import { buildSitemap } from "./sitemap";

/**
 * 廃止したページの転送先。旧 URL の評価を引き継ぐため、サーバー側で恒久的に転送する (issue #142)。
 * src/routes にも同じパスのルートを残している (SW やアプリ内の遷移で来たときはそちらが転送する)
 */
export const PAGE_REDIRECTS: Record<string, string> = {
  "/login": "/",
};

/** Worker に来たページのリクエスト (/api/* と静的アセット以外) をどう返すか */
export type PageResolution =
  | { kind: "page"; status: 200 | 404 }
  | { kind: "redirect"; location: string }
  /** 公開ページの一覧から組み立てる sitemap.xml (issue #149) */
  | { kind: "sitemap" }
  /** 拡張子付きのパス (消えたチャンクなど)。HTML を返すとスクリプトや画像として読まれてしまうので本文は付けない */
  | { kind: "missing" };

/**
 * パスから返し方を決める。知っているページは index.html を 200 で、それ以外も index.html (SPA が
 * NotFound を描く) を 404 で返す (200 だと検索エンジンにソフト 404 とみなされる。issue #141)。
 * 末尾のスラッシュは外した URL へ転送する (同じページが 2 つの URL で見えないように)
 */
export function resolvePage(pathname: string, search = ""): PageResolution {
  if (pathname !== "/" && pathname.endsWith("/")) {
    return { kind: "redirect", location: `${pathname.replace(/\/+$/, "") || "/"}${search}` };
  }
  const moved = PAGE_REDIRECTS[pathname];
  if (moved) return { kind: "redirect", location: `${moved}${search}` };
  if ((PAGE_PATHS as readonly string[]).includes(pathname)) return { kind: "page", status: 200 };
  if (pathname === "/sitemap.xml") return { kind: "sitemap" };
  if (/\.[a-z0-9]+$/i.test(pathname)) return { kind: "missing" };
  return { kind: "page", status: 404 };
}

/**
 * ページのレスポンスを作る。本文は静的アセットの index.html (/ で取る。/index.html は / へ転送される)。
 * 条件付きリクエストのヘッダーは渡さない (304 が返ると本文を返せない)
 */
export async function servePage(request: Request, assets: Fetcher): Promise<Response> {
  const url = new URL(request.url);
  const resolution = resolvePage(url.pathname, url.search);
  switch (resolution.kind) {
    case "redirect":
      return new Response(null, { status: 301, headers: { Location: resolution.location } });
    case "sitemap":
      // 本番の URL で書く (検索エンジンに伝えるのは本番のページなので、ローカルで開いても同じ)
      return new Response(buildSitemap(SITE_ORIGIN, PAGE_PATHS), {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "public, max-age=3600",
        },
      });
    case "missing":
      return new Response("Not Found", { status: 404 });
    case "page": {
      const index = await assets.fetch(new URL("/", url));
      const headers = new Headers(index.headers);
      // ETag は / の index.html のもの。別の URL・ステータスで使い回させない (本文も書き換えることがある)
      headers.delete("ETag");
      headers.delete("Content-Length");
      // 利用規約などは、初期 HTML の時点でページのタイトル・説明文・canonical にする (issue #144)
      const head = resolution.status === 200 ? subPageHead(url.pathname) : undefined;
      const body = head ? applyPageHead(await index.text(), head) : index.body;
      return new Response(body, { status: resolution.status, headers });
    }
  }
}
