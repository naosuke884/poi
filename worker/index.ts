import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { createAuth, type Auth, type Session } from "./auth";

type AppEnv = {
  Bindings: Env;
  Variables: {
    auth: Auth;
    user: Session["user"] | null;
    session: Session["session"] | null;
  };
};

// リクエストごとに Better Auth インスタンスを生成し、セッションを解決する
const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const auth = createAuth(c.env, new URL(c.req.url).origin);
  c.set("auth", auth);
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", result?.user ?? null);
  c.set("session", result?.session ?? null);
  await next();
});

// ログイン必須ルート用ガード
const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

const app = new Hono<AppEnv>();

app.use("/api/*", authMiddleware);

// Better Auth のエンドポイント (/api/auth/sign-in/social, /api/auth/get-session ...)
app.all("/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

const api = new Hono<AppEnv>()
  .get("/hello", (c) => c.json({ message: "Hello from Hono on Cloudflare Workers!" }))
  .get("/me", requireAuth, (c) => c.json({ user: c.get("user")! }));

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
