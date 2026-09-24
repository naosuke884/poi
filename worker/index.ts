import { Hono } from "hono";
import { boardRoutes, settingsRoutes } from "./app/routes";
import { deleteExpiredMemos } from "./app/sweep";
import { authMiddleware } from "./auth/middleware";
import { createDb } from "./db";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use("/api/*", authMiddleware);

// Better Auth のエンドポイント (/api/auth/sign-in/social, /api/auth/get-session ...)
app.all("/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

// RPC クライアント (src/lib/api.ts) に型を渡すため、ルートはメソッドチェーンで定義する
const api = new Hono<AppEnv>().route("/board", boardRoutes).route("/settings", settingsRoutes);

app.route("/api", api);

// 未定義の /api/* は 404 JSON、それ以外は SPA (index.html) にフォールバック
app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "Not Found" }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
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
