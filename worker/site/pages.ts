import { APP_PATHS, INDEXED_PAGE_PATHS, PAGE_PATHS, SITE_ORIGIN } from "@shared/site";
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
  /** 301 は恒久的な移転 (旧 URL の評価を引き継ぐ)、302 はログイン済みの人をトップから板へ送るとき */
  | { kind: "redirect"; location: string; status: 301 | 302 }
  /** 公開ページの一覧から組み立てる sitemap.xml (issue #149) */
  | { kind: "sitemap" }
  /** 拡張子付きのパス (消えたチャンクなど)。HTML を返すとスクリプトや画像として読まれてしまうので本文は付けない */
  | { kind: "missing" };

/**
 * セッション Cookie (Better Auth の session_token。https では __Secure- が付く) があるか。
 * 期限切れかどうかまでは見ない (切れていれば板の loader がランディングへ戻し、Better Auth が Cookie を消す)。
 * multiSession の session_token_multi-* は、ログアウトで消えずに残ることがあるので見ない
 */
export function hasSessionCookie(cookie: string | null): boolean {
  return cookie !== null && /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=[^;]/.test(cookie);
}

/**
 * パスから返し方を決める。知っているページは index.html を 200 で、それ以外も index.html (SPA が
 * NotFound を描く) を 404 で返す (200 だと検索エンジンにソフト 404 とみなされる。issue #141)。
 * 末尾のスラッシュは外した URL へ転送する (同じページが 2 つの URL で見えないように)。
 * ログイン済み (signedIn) でトップに来たら板へ転送する (ランディングを一瞬も見せない。issue #156)
 */
export function resolvePage(pathname: string, search = "", signedIn = false): PageResolution {
  if (pathname !== "/" && pathname.endsWith("/")) {
    return {
      kind: "redirect",
      location: `${pathname.replace(/\/+$/, "") || "/"}${search}`,
      status: 301,
    };
  }
  if (pathname === "/" && signedIn) {
    return { kind: "redirect", location: `${APP_PATHS[0]}${search}`, status: 302 };
  }
  const moved = PAGE_REDIRECTS[pathname];
  if (moved) return { kind: "redirect", location: `${moved}${search}`, status: 301 };
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
  const resolution = resolvePage(
    url.pathname,
    url.search,
    hasSessionCookie(request.headers.get("Cookie")),
  );
  switch (resolution.kind) {
    case "redirect": {
      const headers = new Headers({ Location: resolution.location });
      // ログイン状態で変わる転送は、ブラウザや中継にキャッシュさせない (ログアウト後もトップが板へ飛ばないように)
      if (resolution.status === 302) headers.set("Cache-Control", "no-store");
      return new Response(null, { status: resolution.status, headers });
    }
    case "sitemap":
      // 本番の URL で書く (検索エンジンに伝えるのは本番のページなので、ローカルで開いても同じ)
      return new Response(buildSitemap(SITE_ORIGIN, INDEXED_PAGE_PATHS), {
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
      // 板は検索結果に出さない (issue #156)
      if ((APP_PATHS as readonly string[]).includes(url.pathname)) {
        headers.set("X-Robots-Tag", "noindex");
      }
      // トップはログイン状態で返し方 (ランディング / 板への転送) が変わる。Cookie ごとに別物として扱わせる
      if (url.pathname === "/") headers.append("Vary", "Cookie");
      return new Response(body, { status: resolution.status, headers });
    }
  }
}
