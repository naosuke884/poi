import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { BOARD_MAX_LENGTH, BOARD_MAX_SECTIONS, SECTION_SEPARATOR } from "@shared/constants";
import {
  INDEXED_PAGE_PATHS,
  PRERENDERED_PAGES,
  SITE_NAME,
  SITE_ORIGIN,
  TOP_DESCRIPTION,
  TOP_TITLE,
} from "@shared/site";
import { describe, expect, vi } from "vite-plus/test";

import { test } from "./d1-test";
import worker from "./index";

// Worker 全体 (authMiddleware → Better Auth のハンドラ → レスポンスの加工) をテストごとに立てる空のローカル D1 に対して通す。
// ログインは Google を通さず、session 行を入れて Better Auth と同じ署名の cookie を作って済ませる
// (.claude/skills/verifying-in-app/scripts/seed-session.mjs と同じ方法)

const ORIGIN = "http://localhost";
/** テスト用の静的アセットが、ビルド時に描いた HTML の #root に入れる目印 */
const prerenderedMarker = (assetPath: string) => `<h1>${assetPath}</h1>`;
const USER_ID = "u1";

/** Workers Rate Limiting の binding の代わり。key ごとに数え、limit 回を超えたら断る */
function fakeRateLimiter(limit = Number.POSITIVE_INFINITY) {
  const counts = new Map<string, number>();
  return {
    limit: async ({ key }: { key: string }) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { success: count <= limit };
    },
  } as RateLimit;
}

/** テスト用の環境。シークレットは .dev.vars に頼らず (CI には無い) テスト用の値を渡す */
function testEnv(db: D1Database) {
  return {
    DB: db,
    // レート制限を確かめるテスト以外では断らない
    BOARD_RATE_LIMITER: fakeRateLimiter(),
    SETTINGS_RATE_LIMITER: fakeRateLimiter(),
    AUTH_RATE_LIMITER: fakeRateLimiter(),
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
}

const it = test
  .extend("env", async ({ db }) => {
    const now = Date.now();
    await db
      .prepare(
        "insert into user (id, name, email, email_verified, created_at, updated_at) values (?, 'Test', 'test@example.com', 1, ?, ?)",
      )
      .bind(USER_ID, now, now)
      .run();
    return testEnv(db);
  })
  /** Worker 全体にリクエストを通す */
  .extend(
    "request",
    ({ env }) =>
      (
        path: string,
        init: Omit<RequestInit, "headers"> & { headers?: Record<string, string> } = {},
      ) =>
        worker.fetch(
          new Request(`${ORIGIN}${path}`, {
            ...init,
            headers: { Origin: ORIGIN, "Content-Type": "application/json", ...init.headers },
          }),
          env,
          {} as ExecutionContext,
        ),
  )
  /** ログイン直後のセッションを作り、その Cookie ヘッダーの値を返す */
  .extend("signIn", ({ env }) => async () => {
    const token = randomUUID().replaceAll("-", "");
    const now = Date.now();
    await env.DB.prepare(
      "insert into session (id, token, user_id, expires_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
    )
      .bind(randomUUID(), token, USER_ID, now + 86_400_000, now, now)
      .run();
    const sig = createHmac("sha256", env.BETTER_AUTH_SECRET).update(token).digest("base64");
    return `better-auth.session_token=${encodeURIComponent(`${token}.${sig}`)}`;
  });

async function userCount(db: D1Database) {
  const row = await db.prepare("select count(*) as n from user").first<{ n: number }>();
  return row?.n;
}

describe.concurrent("ログアウト / アカウント削除で cookie を消させる (issue #136)", () => {
  it("ログアウトの成功レスポンスに Clear-Site-Data: cookies が付く", async ({
    request,
    signIn,
  }) => {
    const res = await request("/api/auth/sign-out", {
      method: "POST",
      body: "{}",
      headers: { Cookie: await signIn() },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Clear-Site-Data")).toBe('"cookies"');
  });

  it("アカウント削除の成功レスポンスに付き、ユーザーも消える", async ({ env, request, signIn }) => {
    const res = await request("/api/auth/delete-user", {
      method: "POST",
      body: "{}",
      headers: { Cookie: await signIn() },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Clear-Site-Data")).toBe('"cookies"');
    expect(await userCount(env.DB)).toBe(0);
  });

  it("未ログインでのアカウント削除は失敗し、付かない", async ({ env, request }) => {
    const res = await request("/api/auth/delete-user", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    expect(res.headers.has("Clear-Site-Data")).toBe(false);
    expect(await userCount(env.DB)).toBe(1);
  });

  it("セッションの確認には付かない", async ({ request, signIn }) => {
    const res = await request("/api/auth/get-session", { headers: { Cookie: await signIn() } });
    expect(res.status).toBe(200);
    expect(res.headers.has("Clear-Site-Data")).toBe(false);
  });
});

describe.concurrent("セキュリティ関連のレスポンスヘッダー (issue #111)", () => {
  // フィクスチャはテストの文脈で受け取るので、each ではなく for を使う
  it.for([
    ["未ログインで弾いた API (401)", "/api/board"],
    ["未定義の API (404)", "/api/nope"],
    ["Better Auth のハンドラ", "/api/auth/get-session"],
  ] as const)("%s にも付く", async ([, path], { request }) => {
    const res = await request(path);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("ログアウトでは Clear-Site-Data と両方付く", async ({ request, signIn }) => {
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

  it("静的アセットの iframe 埋め込みの禁止は API と同じ値", async ({ request }) => {
    const res = await request("/api/nope");
    expect(staticHeader("X-Frame-Options")).toBe(res.headers.get("X-Frame-Options"));
  });

  it("HSTS は API にも静的アセットにも付けない (Cloudflare のゾーン設定で付ける)", async ({
    request,
  }) => {
    const res = await request("/api/nope");
    expect(res.headers.get("Strict-Transport-Security")).toBeNull();
    expect(staticHeader("Strict-Transport-Security")).toBeUndefined();
  });

  it("index.html にインラインスクリプトが無い (CSP の script-src 'self' に引っかかるため)", () => {
    expect(staticHeader("Content-Security-Policy")).toContain("script-src 'self';");
    const html = readFileSync("index.html", "utf8");
    // 構造化データ (application/ld+json) は実行されないので CSP の対象外
    const inlineScripts = [...html.matchAll(/<script\b([^>]*)>/gi)].filter(
      ([, attrs]) =>
        !/\bsrc=/i.test(attrs ?? "") && !/type="application\/ld\+json"/i.test(attrs ?? ""),
    );
    expect(inlineScripts).toEqual([]);
  });
});

describe.concurrent("index.html の検索・カード向けの文言 (issue #145)", () => {
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

describe.concurrent("ページのリクエスト (静的アセットに無いパス)", () => {
  it("公開しているページは index.html を 200 で返す", async ({ request }) => {
    const res = await request("/terms");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(await res.text()).toContain('<div id="root">');
  });

  it("利用規約・プライバシーポリシーは初期 HTML のタイトルと canonical がそのページのもの (issue #144)", async ({
    request,
  }) => {
    const terms = await (await request("/terms")).text();
    expect(terms).toContain("<title>利用規約 | poi</title>");
    expect(terms).toContain('<link rel="canonical" href="https://poinote.app/terms" />');
    const privacy = await (await request("/privacy")).text();
    expect(privacy).toContain("<title>プライバシーポリシー | poi</title>");
    // 知らないパスはトップの head のまま
    const notFound = await (await request("/nope")).text();
    expect(notFound).toContain(`<title>${TOP_TITLE}</title>`);
  });

  it("知らないパスは index.html を 404 で返す (issue #141)", async ({ request }) => {
    const res = await request("/nope");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('<div id="root">');
  });

  it("/login は / へ恒久的に転送する (issue #142)", async ({ request }) => {
    const res = await request("/login");
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/");
  });

  it("/sitemap.xml は公開ページをすべて載せた XML (issue #149)", async ({ request }) => {
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

  it("ログイン済みでトップを開いたら板へ 302 で転送し、キャッシュさせない (issue #156)", async ({
    request,
    signIn,
  }) => {
    const res = await request("/?from=pwa", { headers: { Cookie: await signIn() } });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/board?from=pwa");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("未ログインならトップはランディングを描いた landing.html を返す (issue #157)", async ({
    request,
  }) => {
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

  it("使い方とよくある質問は本文を描いた HTML を、そのページの head にして返す (issue #157)", async ({
    request,
  }) => {
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

  it("landing.html が無ければ (Vite の開発サーバー) トップは index.html を返す", async ({
    env,
  }) => {
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

  it("板は noindex で、canonical を板にする (issue #156)", async ({ request }) => {
    const res = await request("/board");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(await res.text()).toContain('<link rel="canonical" href="https://poinote.app/board" />');
    // 公開ページには付けない
    expect((await request("/terms")).headers.get("X-Robots-Tag")).toBeNull();
  });

  it("知らない /api/* は今までどおり 404 の JSON", async ({ request }) => {
    const res = await request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not Found" });
  });
});

describe.concurrent("Cron (scheduled)", () => {
  it("予定時刻の時点で期限を過ぎたセクションの中身を消し、期限前のものは残す", async ({ env }) => {
    const scheduledTime = Date.now();
    for (const [id, expiresAt] of [
      ["expired", scheduledTime - 1],
      ["alive", scheduledTime + 86_400_000],
    ] as const) {
      await env.DB.prepare(
        "insert into memo (id, user_id, content, position, created_at, updated_at, expires_at) values (?, ?, ?, 0, ?, ?, ?)",
      )
        .bind(id, USER_ID, id, scheduledTime, scheduledTime, expiresAt)
        .run();
    }

    await worker.scheduled(
      { scheduledTime, cron: "0 * * * *", noRetry: () => {} } as ScheduledController,
      env,
      {} as ExecutionContext,
    );

    const { results } = await env.DB.prepare("select id, content from memo order by id").all<{
      id: string;
      content: string;
    }>();
    expect(results).toEqual([
      { id: "alive", content: "alive" },
      { id: "expired", content: "" },
    ]);
  });

  it("期限を過ぎたセッションも消し、有効なセッションは残す", async ({ env, signIn }) => {
    await signIn();
    const scheduledTime = Date.now();
    await env.DB.prepare(
      "insert into session (id, token, user_id, expires_at, created_at, updated_at) values ('expired', 'expired-token', ?, ?, ?, ?)",
    )
      .bind(USER_ID, scheduledTime - 1, scheduledTime, scheduledTime)
      .run();

    await worker.scheduled(
      { scheduledTime, cron: "0 * * * *", noRetry: () => {} } as ScheduledController,
      env,
      {} as ExecutionContext,
    );

    const { results } = await env.DB.prepare("select id from session").all<{ id: string }>();
    expect(results.map((row) => row.id)).not.toContain("expired");
    expect(results).toHaveLength(1);
  });
});

describe.concurrent("API の本文の大きさの上限", () => {
  it("1MiB を超える本文は、ログインを確かめる前に 413 の JSON で断る", async ({ request }) => {
    const res = await request("/api/board", { method: "PUT", body: "x".repeat(1024 * 1024 + 1) });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "PayloadTooLarge" });
  });

  it("上限いっぱいの板 (セクション数・文字数とも最大で、エスケープで膨らむ文字) は保存できる", async ({
    request,
    signIn,
  }) => {
    const createdAt = new Date().toISOString();
    const perSection = Math.floor(
      (BOARD_MAX_LENGTH - (BOARD_MAX_SECTIONS - 1) * SECTION_SEPARATOR.length) / BOARD_MAX_SECTIONS,
    );
    const sections = Array.from({ length: BOARD_MAX_SECTIONS }, () => ({
      id: randomUUID(),
      createdAt,
      content: "\u0001".repeat(perSection),
    }));
    const body = JSON.stringify({ userId: USER_ID, revision: null, sections });
    const res = await request("/api/board", {
      method: "PUT",
      body,
      headers: { Cookie: await signIn() },
    });
    expect(res.status).toBe(200);
  });
});

describe.concurrent("想定外のエラー", () => {
  it("API で例外が起きたら、他のエラーと同じ形の 500 の JSON を返し、セキュリティヘッダーも付ける", async ({
    env,
    request,
    signIn,
  }) => {
    const cookie = await signIn();
    // 設定の表が無い D1 (読み込みが SQL エラーになる)
    await env.DB.prepare("drop table user_setting").run();
    const res = await request("/api/settings", { headers: { Cookie: cookie } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal Server Error" });
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe.concurrent("レート制限", () => {
  it("PUT /api/board はユーザーごとの上限を超えたら 429 の JSON で断る", async ({
    env,
    request,
    signIn,
  }) => {
    env.BOARD_RATE_LIMITER = fakeRateLimiter(1);
    const cookie = await signIn();
    const put = () =>
      request("/api/board", {
        method: "PUT",
        body: JSON.stringify({ userId: USER_ID, revision: null, sections: [] }),
        headers: { Cookie: cookie },
      });
    expect((await put()).status).toBe(200);
    const res = await put();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "TooManyRequests" });
  });

  it("GET /api/board は数えない", async ({ env, request, signIn }) => {
    env.BOARD_RATE_LIMITER = fakeRateLimiter(0);
    const res = await request("/api/board", { headers: { Cookie: await signIn() } });
    expect(res.status).toBe(200);
  });

  it("未ログインの PUT /api/board は数えずに 401 で断る", async ({ env, request }) => {
    env.BOARD_RATE_LIMITER = fakeRateLimiter(0);
    const res = await request("/api/board", {
      method: "PUT",
      body: JSON.stringify({ userId: USER_ID, revision: null, sections: [] }),
    });
    expect(res.status).toBe(401);
  });

  it("PUT /api/settings はユーザーごとの上限を超えたら 429 で断る", async ({
    env,
    request,
    signIn,
  }) => {
    env.SETTINGS_RATE_LIMITER = fakeRateLimiter(1);
    const cookie = await signIn();
    const put = () =>
      request("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ memoTtlDays: 7 }),
        headers: { Cookie: cookie },
      });
    expect((await put()).status).toBe(200);
    expect((await put()).status).toBe(429);
  });

  it("/api/auth/* への書き込みは IP アドレスごとの上限を超えたら 429 で断り、別の IP アドレスは通す", async ({
    env,
    request,
  }) => {
    env.AUTH_RATE_LIMITER = fakeRateLimiter(1);
    const signOut = (ip: string) =>
      request("/api/auth/sign-out", {
        method: "POST",
        body: "{}",
        headers: { "cf-connecting-ip": ip },
      });
    expect((await signOut("192.0.2.1")).status).not.toBe(429);
    const res = await signOut("192.0.2.1");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "TooManyRequests" });
    expect((await signOut("192.0.2.2")).status).not.toBe(429);
  });

  it("OAuth のコールバックは GET でも数える", async ({ env, request }) => {
    env.AUTH_RATE_LIMITER = fakeRateLimiter(0);
    const res = await request("/api/auth/callback/google?state=x&code=y", {
      headers: { "cf-connecting-ip": "192.0.2.1" },
    });
    expect(res.status).toBe(429);
  });

  it("セッションの確認 (get-session) は数えない (ページを開くたびに呼ばれるため)", async ({
    env,
    request,
    signIn,
  }) => {
    env.AUTH_RATE_LIMITER = fakeRateLimiter(0);
    const res = await request("/api/auth/get-session", {
      headers: { "cf-connecting-ip": "192.0.2.1", Cookie: await signIn() },
    });
    expect(res.status).toBe(200);
  });
});

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USER = { sub: "google-sub-1", email: "google@example.com", name: "Google User" };

/** 署名の無い JWT。Better Auth はコールバックで Google の id_token を検証せずに中身を読むだけなので、これで足りる */
function unsignedJwt(claims: Record<string, unknown>) {
  const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.`;
}

/** Set-Cookie を、ブラウザが次のリクエストで送る Cookie ヘッダーの値にする */
function cookieHeader(res: Response) {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

const oauthIt = it
  /**
   * Google のトークンエンドポイントの代わり (プロセスの外にあるので、ここだけ偽物にする)。
   * 受けた認可コードを記録し、GOOGLE_USER の id_token を返す。ほかの URL は本物の fetch に渡す
   */
  // oxlint-disable-next-line no-empty-pattern -- Vitest はフィクスチャの依存を第 1 引数の分割代入から読むので、依存が無くても {} が要る
  .extend("google", async ({}, { onCleanup }) => {
    const realFetch = globalThis.fetch;
    const exchangedCodes: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      if (req.url !== GOOGLE_TOKEN_ENDPOINT) return realFetch(input, init);
      exchangedCodes.push(new URLSearchParams(await req.text()).get("code") ?? "");
      return Response.json({
        access_token: "google-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        id_token: unsignedJwt({ ...GOOGLE_USER, email_verified: true, aud: "test-client-id" }),
      });
    });
    onCleanup(() => {
      vi.unstubAllGlobals();
    });
    return { exchangedCodes };
  })
  /** ランディングのログインボタンと同じく Google ログインを始め、Google に渡す state と、そのブラウザの cookie を返す */
  .extend("startGoogleSignIn", ({ request }) => async () => {
    const res = await request("/api/auth/sign-in/social", {
      method: "POST",
      body: JSON.stringify({ provider: "google", callbackURL: "/board" }),
    });
    const { url } = await res.json<{ url: string }>();
    return { state: new URL(url).searchParams.get("state") ?? "", cookie: cookieHeader(res) };
  });

async function sessionCount(db: D1Database) {
  const row = await db.prepare("select count(*) as n from session").first<{ n: number }>();
  return row?.n;
}

const errorCode = (res: Response) =>
  new URL(res.headers.get("Location") ?? "", ORIGIN).searchParams.get("error");

// fetch を差し替えるのはプロセス全体なので、このまとまりのテストは並行させない
describe("OAuth のコールバックで state cookie を照合する (HAY-42)", () => {
  oauthIt(
    "ログインを始めたブラウザの cookie が付いたコールバックはログインでき、板へ戻る",
    async ({ env, request, google, startGoogleSignIn }) => {
      const { state, cookie } = await startGoogleSignIn();
      const res = await request(`/api/auth/callback/google?state=${state}&code=good-code`, {
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(302);
      expect(new URL(res.headers.get("Location") ?? "", ORIGIN).pathname).toBe("/board");
      expect(google.exchangedCodes).toEqual(["good-code"]);
      const session = await request("/api/auth/get-session", {
        headers: { Cookie: cookieHeader(res) },
      });
      expect((await session.json<{ user: { email: string } }>()).user.email).toBe(
        GOOGLE_USER.email,
      );
      expect(await sessionCount(env.DB)).toBe(1);
    },
  );

  oauthIt(
    "state cookie の無いブラウザからのコールバックは state_mismatch で断り、Google にコードを渡さない (login CSRF)",
    async ({ env, request, google, startGoogleSignIn }) => {
      // 攻撃者が自分のブラウザでログインを始め、得た state のコールバック URL を被害者に踏ませる
      const { state } = await startGoogleSignIn();
      const res = await request(`/api/auth/callback/google?state=${state}&code=attacker-code`);
      expect(res.status).toBe(302);
      expect(errorCode(res)).toBe("state_mismatch");
      expect(google.exchangedCodes).toEqual([]);
      expect(await sessionCount(env.DB)).toBe(0);
    },
  );

  oauthIt(
    "別のログインで付いた state cookie では state_mismatch で断る",
    async ({ env, request, google, startGoogleSignIn }) => {
      const attacker = await startGoogleSignIn();
      const victim = await startGoogleSignIn();
      const res = await request(
        `/api/auth/callback/google?state=${attacker.state}&code=attacker-code`,
        { headers: { Cookie: victim.cookie } },
      );
      expect(errorCode(res)).toBe("state_mismatch");
      expect(google.exchangedCodes).toEqual([]);
      expect(await sessionCount(env.DB)).toBe(0);
    },
  );

  oauthIt(
    "ログインを始めていない state のコールバックは state_mismatch で断る",
    async ({ env, request, google }) => {
      const res = await request("/api/auth/callback/google?state=x&code=y");
      expect(errorCode(res)).toBe("state_mismatch");
      expect(google.exchangedCodes).toEqual([]);
      expect(await sessionCount(env.DB)).toBe(0);
    },
  );
});
