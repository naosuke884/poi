import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

import { withClearSiteData } from "./auth/clear-site-data";
import { authMiddleware } from "./auth/middleware";
import { boardRoutes, settingsRoutes } from "./board/routes";
import { deleteExpiredMemos } from "./board/sweep";
import { createDb } from "./db";
import { servePage } from "./site/pages";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

// /api/* のレスポンスにセキュリティ関連のヘッダーを付ける (401 や 404 も含め、authMiddleware より前に置く)。
// 静的アセット側は public/_headers で付ける。iframe 埋め込みの禁止はそちらと値を揃えている。
// HSTS は付けない: Cloudflare のゾーン設定 (Edge Certificates) が全レスポンスに付けて上書きするため。
// JSON を返すだけなので CSP・Permissions-Policy は付けない
app.use("/api/*", secureHeaders({ strictTransportSecurity: false, xFrameOptions: "DENY" }));
app.use("/api/*", authMiddleware);

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

export type ApiType = typeof api;

// Cron Trigger (wrangler.jsonc の triggers.crons) から呼ばれ、期限切れのセクションを物理削除する。
// 削除件数は console.log に出す (observability が有効なので Workers Logs で確認できる)。
// ローカルでの確認手順 (`npm run dev` (Vite) では --test-scheduled が使えないので wrangler dev を直接起動する。
// --config を明示するとビルド済み設定へのリダイレクトが無効になり、/__scheduled が使える):
//   npm run build
//   npx wrangler dev --config wrangler.jsonc --assets dist/client --test-scheduled
//   curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"   # 別ターミナルで。ログに [memo sweep] ... が出る
// 期限切れの行は `npx wrangler d1 execute poi --local --command "..."` で expires_at を過去にして用意する。
const scheduled: ExportedHandlerScheduledHandler<Env> = async (controller, env) => {
  const now = new Date(controller.scheduledTime);
  const deleted = await deleteExpiredMemos(createDb(env.DB), now);
  console.log(
    `[memo sweep] deleted ${deleted} expired section(s) (cron: ${controller.cron}, scheduledTime: ${now.toISOString()})`,
  );
};

export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<Env>;
