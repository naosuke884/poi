import { createHmac, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import {
  INDEXED_PAGE_PATHS,
  PRERENDERED_PAGES,
  SITE_NAME,
  SITE_ORIGIN,
  TOP_DESCRIPTION,
  TOP_TITLE,
} from "@shared/site";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import worker from "./index";

// Worker 全体 (authMiddleware → Better Auth のハンドラ → レスポンスの加工) をローカルの D1 に対して通す。
// ログインは Google を通さず、session 行を入れて Better Auth と同じ署名の cookie を作って済ませる
// (.claude/skills/verifying-in-app/scripts/seed-session.mjs と同じ方法)

const ORIGIN = "http://localhost";
/** テスト用の静的アセットが、ビルド時に描いた HTML の #root に入れる目印 */
const prerenderedMarker = (assetPath: string) => `<h1>${assetPath}</h1>`;
const USER_ID = "u1";
let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
let env: Env;

beforeAll(async () => {
  proxy = await getPlatformProxy<Env>({ persist: false });
  // シークレットは .dev.vars に頼らず (CI には無い) テスト用の値を渡す
  env = {
    DB: proxy.env.DB,
    BETTER_AUTH_SECRET: "test-secret-0123456789abcdef0123456789",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    // 静的アセットの代わり。ビルド時に本文まで描く HTML (/landing.html など) はファイル名の目印の入った HTML を、
    // それ以外はどのパスを聞かれても index.html を返す。どちらにも public/_headers と同じく noindex を付ける
    ASSETS: {
      fetch: async (input: Request | string | URL) => {
        const { pathname } = new URL(input instanceof Request ? input.url : input);
        const html = readFileSync("index.html", "utf8");
        const prerendered = Object.values(PRERENDERED_PAGES).some(
          (file) => pathname === `/${file}`,
        );
        return new Response(
          prerendered
            ? html.replace(
                '<div id="root"></div>',
                `<div id="root">${prerenderedMarker(pathname)}</div>`,
              )
            : html,
          { headers: { "Content-Type": "text/html", "X-Robots-Tag": "noindex" } },
        );
      },
    },
  } as unknown as Env;
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const statements = readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint");
    await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
  }
}, 60_000);

afterAll(async () => {
  await proxy?.dispose();
});

beforeEach(async () => {
  await env.DB.prepare("delete from user").run();
  const now = Date.now();
  await env.DB.prepare(
    "insert into user (id, name, email, email_verified, created_at, updated_at) values (?, 'Test', 'test@example.com', 1, ?, ?)",
  )
    .bind(USER_ID, now, now)
    .run();
});

/** ログイン直後のセッションを作り、その Cookie ヘッダーの値を返す */
async function signIn(): Promise<string> {
  const token = randomUUID().replaceAll("-", "");
  const now = Date.now();
  await env.DB.prepare(
    "insert into session (id, token, user_id, expires_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
  )
    .bind(randomUUID(), token, USER_ID, now + 86_400_000, now, now)
    .run();
  const sig = createHmac("sha256", env.BETTER_AUTH_SECRET).update(token).digest("base64");
  return `better-auth.session_token=${encodeURIComponent(`${token}.${sig}`)}`;
}

function request(path: string, init: RequestInit = {}) {
  return worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      ...init,
      headers: { Origin: ORIGIN, "Content-Type": "application/json", ...init.headers },
    }),
    env,
    {} as ExecutionContext,
  );
}

async function userCount() {
  const row = await env.DB.prepare("select count(*) as n from user").first<{ n: number }>();
  return row?.n;
}

describe("ログアウト / アカウント削除で cookie を消させる (issue #136)", () => {
  it("ログアウトの成功レスポンスに Clear-Site-Data: cookies が付く", async () => {
    const res = await request("/api/auth/sign-out", {
      method: "POST",
      body: "{}",
      headers: { Cookie: await signIn() },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Clear-Site-Data")).toBe('"cookies"');
  });

  it("アカウント削除の成功レスポンスに付き、ユーザーも消える", async () => {
    const res = await request("/api/auth/delete-user", {
      method: "POST",
      body: "{}",
      headers: { Cookie: await signIn() },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Clear-Site-Data")).toBe('"cookies"');
    expect(await userCount()).toBe(0);
  });

  it("未ログインでのアカウント削除は失敗し、付かない", async () => {
    const res = await request("/api/auth/delete-user", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    expect(res.headers.has("Clear-Site-Data")).toBe(false);
    expect(await userCount()).toBe(1);
  });

  it("セッションの確認には付かない", async () => {
    const res = await request("/api/auth/get-session", { headers: { Cookie: await signIn() } });
    expect(res.status).toBe(200);
    expect(res.headers.has("Clear-Site-Data")).toBe(false);
  });
});

describe("セキュリティ関連のレスポンスヘッダー (issue #111)", () => {
  it.each([
    ["未ログインで弾いた API (401)", "/api/board", {}],
    ["未定義の API (404)", "/api/nope", {}],
    ["Better Auth のハンドラ", "/api/auth/get-session", {}],
  ])("%s にも付く", async (_, path, init) => {
    const res = await request(path, init);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Strict-Transport-Security")).toBe("max-age=86400");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("ログアウトでは Clear-Site-Data と両方付く", async () => {
    const res = await request("/api/auth/sign-out", {
      method: "POST",
      body: "{}",
      headers: { Cookie: await signIn() },
    });
    expect(res.headers.get("Clear-Site-Data")).toBe('"cookies"');
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  // 静的アセットのヘッダー (public/_headers) は Worker を通らないので、ファイルの中身で確かめる
  const headersFile = readFileSync("public/_headers", "utf8");
  const staticHeader = (name: string) =>
    headersFile.match(new RegExp(`^\\s+${name}: (.*)$`, "m"))?.[1];

  it("本文を描いた HTML そのものは検索結果に出さない (public/_headers の noindex)", () => {
    for (const file of Object.values(PRERENDERED_PAGES)) {
      expect(headersFile).toMatch(
        new RegExp(`^/${file.replace(".", "\\.")}\\n\\s+X-Robots-Tag: noindex$`, "m"),
      );
    }
  });

  it("静的アセットの HSTS と iframe 埋め込みの禁止は API と同じ値", async () => {
    const res = await request("/api/nope");
    expect(staticHeader("Strict-Transport-Security")).toBe(
      res.headers.get("Strict-Transport-Security"),
    );
    expect(staticHeader("X-Frame-Options")).toBe(res.headers.get("X-Frame-Options"));
  });

  it("index.html にインラインスクリプトが無い (CSP の script-src 'self' に引っかかるため)", () => {
    expect(staticHeader("Content-Security-Policy-Report-Only")).toContain("script-src 'self';");
    const html = readFileSync("index.html", "utf8");
    // 構造化データ (application/ld+json) は実行されないので CSP の対象外
    const inlineScripts = [...html.matchAll(/<script\b([^>]*)>/g)].filter(
      ([, attrs]) =>
        !/\bsrc=/.test(attrs ?? "") && !/type="application\/ld\+json"/.test(attrs ?? ""),
    );
    expect(inlineScripts).toEqual([]);
  });
});

describe("index.html の検索・カード向けの文言 (issue #145)", () => {
  const html = readFileSync("index.html", "utf8");
  const meta = (attr: string, key: string) =>
    html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1];

  it("タイトルと説明文が shared/site.ts と同じ", () => {
    expect(html.match(/<title>([^<]*)<\/title>/)?.[1]).toBe(TOP_TITLE);
    expect(meta("property", "og:title")).toBe(TOP_TITLE);
    expect(meta("name", "description")).toBe(TOP_DESCRIPTION);
    expect(meta("property", "og:description")).toBe(TOP_DESCRIPTION);
  });

  it("構造化データが JSON として読め、名前・URL・説明文がサイトの値と同じ (issue #147)", () => {
    const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    const { "@graph": graph } = JSON.parse(json ?? "");
    expect(graph.find((d: { "@type": string }) => d["@type"] === "WebApplication")).toMatchObject({
      name: SITE_NAME,
      url: `${SITE_ORIGIN}/`,
      description: TOP_DESCRIPTION,
    });
  });

  it("構造化データの WebSite がサイト名とトップの URL を持つ (issue #154)", () => {
    const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    const { "@graph": graph } = JSON.parse(json ?? "");
    expect(graph.find((d: { "@type": string }) => d["@type"] === "WebSite")).toMatchObject({
      name: SITE_NAME,
      url: `${SITE_ORIGIN}/`,
    });
  });
});

describe("ページのリクエスト (静的アセットに無いパス)", () => {
  it("公開しているページは index.html を 200 で返す", async () => {
    const res = await request("/terms");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(await res.text()).toContain('<div id="root">');
  });

  it("利用規約・プライバシーポリシーは初期 HTML のタイトルと canonical がそのページのもの (issue #144)", async () => {
    const terms = await (await request("/terms")).text();
    expect(terms).toContain("<title>利用規約 | poi</title>");
    expect(terms).toContain('<link rel="canonical" href="https://poinote.app/terms" />');
    const privacy = await (await request("/privacy")).text();
    expect(privacy).toContain("<title>プライバシーポリシー | poi</title>");
    // 知らないパスはトップの head のまま
    const notFound = await (await request("/nope")).text();
    expect(notFound).toContain(`<title>${TOP_TITLE}</title>`);
  });

  it("知らないパスは index.html を 404 で返す (issue #141)", async () => {
    const res = await request("/nope");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('<div id="root">');
  });

  it("/login は / へ恒久的に転送する (issue #142)", async () => {
    const res = await request("/login");
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/");
  });

  it("/sitemap.xml は公開ページをすべて載せた XML (issue #149)", async () => {
    const res = await request("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    const xml = await res.text();
    for (const path of INDEXED_PAGE_PATHS) {
      expect(xml).toContain(`<loc>${SITE_ORIGIN}${path}</loc>`);
    }
    // 板はログインして使う画面なので載せない (issue #156)
    expect(xml).not.toContain("/board");
  });

  it("ログイン済みでトップを開いたら板へ 302 で転送し、キャッシュさせない (issue #156)", async () => {
    const res = await request("/?from=pwa", { headers: { Cookie: await signIn() } });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/board?from=pwa");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("未ログインならトップはランディングを描いた landing.html を返す (issue #157)", async () => {
    const res = await request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Vary")).toContain("Cookie");
    expect(res.headers.get("X-Robots-Tag")).toBeNull();
    expect(await res.text()).toContain(
      `<div id="root">${prerenderedMarker("/landing.html")}</div>`,
    );
    // 本文を描いていないページは空の index.html
    expect(await (await request("/terms")).text()).toContain('<div id="root"></div>');
  });

  it("使い方とよくある質問は本文を描いた HTML を、そのページの head にして返す (issue #157)", async () => {
    for (const [path, file] of [
      ["/guide", "guide.html"],
      ["/faq", "faq.html"],
    ] as const) {
      const res = await request(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Robots-Tag")).toBeNull();
      const html = await res.text();
      expect(html).toContain(`<div id="root">${prerenderedMarker(`/${file}`)}</div>`);
      expect(html).toContain(`<link rel="canonical" href="${SITE_ORIGIN}${path}" />`);
    }
  });

  it("landing.html が無ければ (Vite の開発サーバー) トップは index.html を返す", async () => {
    const res = await worker.fetch(
      new Request(`${ORIGIN}/`),
      {
        ...env,
        ASSETS: {
          fetch: async (input: Request | string | URL) =>
            new URL(input instanceof Request ? input.url : input).pathname === "/index.html"
              ? new Response(readFileSync("index.html", "utf8"))
              : new Response("Not Found", { status: 404 }),
        },
      } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<div id="root"></div>');
  });

  it("板は noindex で、canonical を板にする (issue #156)", async () => {
    const res = await request("/board");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(await res.text()).toContain('<link rel="canonical" href="https://poinote.app/board" />');
    // 公開ページには付けない
    expect((await request("/terms")).headers.get("X-Robots-Tag")).toBeNull();
  });

  it("知らない /api/* は今までどおり 404 の JSON", async () => {
    const res = await request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not Found" });
  });
});
