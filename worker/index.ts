import { Hono } from "hono";
import { memoRoutes } from "./memo/routes";
import { authMiddleware, requireAuth, type AppEnv } from "./middleware";

const app = new Hono<AppEnv>();

app.use("/api/*", authMiddleware);

// Better Auth のエンドポイント (/api/auth/sign-in/social, /api/auth/get-session ...)
app.all("/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

// RPC クライアント (src/lib/api.ts) に型を渡すため、ルートはメソッドチェーンで定義する
const api = new Hono<AppEnv>()
  .get("/me", requireAuth, (c) => c.json({ user: c.get("user")! }))
  .route("/memos", memoRoutes);

app.route("/api", api);

// 未定義の /api/* は 404 JSON、それ以外は SPA (index.html) にフォールバック
app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "Not Found" }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export type ApiType = typeof api;

export default app;
