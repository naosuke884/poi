import { createHmac, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import worker from "./index";

// Worker 全体 (authMiddleware → Better Auth のハンドラ → レスポンスの加工) をローカルの D1 に対して通す。
// ログインは Google を通さず、session 行を入れて Better Auth と同じ署名の cookie を作って済ませる
// (.claude/skills/verifying-in-app/scripts/seed-session.mjs と同じ方法)

const ORIGIN = "http://localhost";
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
  } as Env;
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
    const inlineScripts = [...html.matchAll(/<script\b([^>]*)>/g)].filter(
      ([, attrs]) => !/\bsrc=/.test(attrs ?? ""),
    );
    expect(inlineScripts).toEqual([]);
  });
});
