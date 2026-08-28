import { Hono } from "hono";
import { createDb } from "./db";
import { boardRoutes } from "./memo/routes";
import { deleteExpiredMemos } from "./memo/sweep";
import { authMiddleware, type AppEnv } from "./middleware";

const app = new Hono<AppEnv>();

app.use("/api/*", authMiddleware);

// Better Auth のエンドポイント (/api/auth/sign-in/social, /api/auth/get-session ...)
app.all("/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

// RPC クライアント (src/lib/api.ts) に型を渡すため、ルートはメソッドチェーンで定義する
const api = new Hono<AppEnv>().route("/board", boardRoutes);

app.route("/api", api);

// 未定義の /api/* は 404 JSON、それ以外は SPA (index.html) にフォールバック
app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "Not Found" }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export type ApiType = typeof api;

// Cron Trigger (wrangler.jsonc の triggers.crons) から呼ばれ、期限切れの行を物理削除する。
// 削除件数は console.log に出す (observability が有効なので Workers Logs で確認できる)。
// ローカルでの確認手順は README「期限切れの行の自動削除 (Cron)」を参照。
const scheduled: ExportedHandlerScheduledHandler<Env> = async (controller, env) => {
  const now = new Date(controller.scheduledTime);
  const deleted = await deleteExpiredMemos(createDb(env.DB), now);
  console.log(
    `[memo sweep] deleted ${deleted} expired line(s) (cron: ${controller.cron}, scheduledTime: ${now.toISOString()})`,
  );
};

export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<Env>;
