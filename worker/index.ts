import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";

import { withClearSiteData } from "./auth/clear-site-data";
import { authMiddleware } from "./auth/middleware";
import { deleteExpiredAuthRecords } from "./auth/sweep";
import { boardRoutes, settingsRoutes } from "./board/routes";
import { sweepExpiredMemos } from "./board/sweep";
import { createDb } from "./db";
import { rateLimit } from "./rate-limit";
import { servePage } from "./site/pages";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

// /api/* のレスポンスにセキュリティ関連のヘッダーを付ける (401 や 404 も含め、authMiddleware より前に置く)。
// 静的アセット側は public/_headers で付ける。iframe 埋め込みの禁止はそちらと値を揃えている。
// HSTS は付けない: Cloudflare のゾーン設定 (Edge Certificates) が全レスポンスに付けて上書きするため。
// JSON を返すだけなので CSP・Permissions-Policy は付けない
app.use("/api/*", secureHeaders({ strictTransportSecurity: false, xFrameOptions: "DENY" }));
// 本文の大きさの上限。文字数の上限 (BOARD_MAX_LENGTH) は JSON を全部読んでから zod で確かめるので、それより前に止める。
// 一番大きい正しい PUT /api/board (2 万文字がすべて \u0001 のような 6 バイトにエスケープされる文字で、1,000 セクションに
// id と createdAt が付く) でも 200KB ほどなので、余裕を持たせて 1MiB にする。セッションを引く (D1 を読む) 前に置く
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json({ error: "PayloadTooLarge" }, 413),
  }),
);
// 認証の入口 (ログインの開始・OAuth のコールバック・ログアウトなど、D1 に書くもの) は未ログインでも来るので
// IP アドレスで数える。Better Auth のインスタンスを作るより前に止める。cf-connecting-ip が無い (テスト) ときは数えない。
// セッションの確認などの読み込み (GET) は数えない: ページを開くたび・タブに戻るたびに get-session が飛ぶので、
// 数えると普通に使っているだけで上限に当たり、ログアウトしたように見える (CI の a11y で 1 分に 30 回を超えた)
app.use(
  "/api/auth/*",
  rateLimit(
    (env) => env.AUTH_RATE_LIMITER,
    (c) =>
      c.req.method === "GET" && !c.req.path.startsWith("/api/auth/callback/")
        ? null
        : c.req.header("cf-connecting-ip"),
  ),
);
app.use("/api/*", authMiddleware);
// 書き込みはユーザーごとに数える (セッションを引いた後に置く)。読み込み (GET) は D1 の書き込みも無いので数えない
app.on(
  "PUT",
  "/api/board",
  rateLimit(
    (env) => env.BOARD_RATE_LIMITER,
    (c) => c.get("user")?.id,
  ),
);
app.on(
  "PUT",
  "/api/settings",
  rateLimit(
    (env) => env.SETTINGS_RATE_LIMITER,
    (c) => c.get("user")?.id,
  ),
);

// Better Auth のエンドポイント (/api/auth/sign-in/social, /api/auth/get-session ...)。
// ログアウト / アカウント削除の成功時は Clear-Site-Data で cookie も消させる
app.all("/api/auth/*", async (c) =>
  withClearSiteData(c.req.raw, await c.get("auth").handler(c.req.raw)),
);

// RPC クライアント (src/lib/api.ts) に型を渡すため、ルートはメソッドチェーンで定義する
const api = new Hono<AppEnv>().route("/board", boardRoutes).route("/settings", settingsRoutes);

app.route("/api", api);

// 未定義の /api/* は 404 JSON。それ以外 (静的アセットに無いパス = /terms などのページと存在しないパス) は
// SPA の index.html を、知らないパスなら 404 で返す (site/pages.ts)
app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "Not Found" }, 404);
  }
  return servePage(c.req.raw, c.env.ASSETS);
});

// 想定外の例外。既定 (Hono) の text/plain の 500 だと、/api/* だけ { error } の形が崩れ、ログにも何も残らない。
// HTTPException (ミドルウェアが意図して投げるもの) はそのレスポンスを返す
app.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  console.error(`[error] ${c.req.method} ${c.req.path}`, error);
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "Internal Server Error" }, 500);
  }
  return c.text("Internal Server Error", 500);
});

export type ApiType = typeof api;

// Cron Trigger (wrangler.jsonc の triggers.crons) から呼ばれ、期限切れのセクションと、期限切れのセッション / 検証用の値を物理削除する。
// 削除件数 (メモは中身を消した件数も) は console.log に出す (observability が有効なので Workers Logs で確認できる)。
// ローカルでの確認手順 (`npm run dev` (Vite) では --test-scheduled が使えないので wrangler dev を直接起動する。
// --config を明示するとビルド済み設定へのリダイレクトが無効になり、/__scheduled が使える):
//   npm run build
//   npx wrangler dev --config wrangler.jsonc --assets dist/client --test-scheduled
//   curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"   # 別ターミナルで。ログに [memo sweep] ... が出る
// 期限切れの行は `npx wrangler d1 execute poi --local --command "..."` で expires_at を過去にして用意する。
// 削除はジョブごとに分け、1 つが失敗しても残りは走らせる (セッションの削除が落ちたせいでメモが消えない、を避ける)。
// 失敗は console.error (Workers Logs で level が error になり、アラートで拾える) に出し、最後に投げ直す。
// 握りつぶすと Cron の実行が成功扱いになり、ダッシュボードの Cron Events でも失敗に気づけない
const scheduled: ExportedHandlerScheduledHandler<Env> = async (controller, env) => {
  const now = new Date(controller.scheduledTime);
  const context = `cron: ${controller.cron}, scheduledTime: ${now.toISOString()}`;
  const db = createDb(env.DB);
  const jobs: [name: string, run: () => Promise<string>][] = [
    [
      "memo sweep",
      async () => {
        const { cleared, deleted } = await sweepExpiredMemos(db, now);
        return `cleared ${cleared} expired section(s), deleted ${deleted} old section(s)`;
      },
    ],
    [
      "auth sweep",
      async () => {
        const { sessions, verifications } = await deleteExpiredAuthRecords(db, now);
        return `deleted ${sessions} session(s), ${verifications} verification(s)`;
      },
    ],
  ];
  const errors: unknown[] = [];
  for (const [name, run] of jobs) {
    try {
      console.log(`[${name}] ${await run()} (${context})`);
    } catch (error) {
      console.error(`[${name}] failed (${context})`, error);
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, "scheduled sweep failed");
};

export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<Env>;
