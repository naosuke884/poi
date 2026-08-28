import { createMiddleware } from "hono/factory";
import { createAuth, type Auth, type Session } from "./auth";

export type AppEnv = {
  Bindings: Env;
  Variables: {
    auth: Auth;
    user: Session["user"] | null;
    session: Session["session"] | null;
  };
};

// リクエストごとに Better Auth インスタンスを生成し、セッションを解決する
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const auth = createAuth(c.env, new URL(c.req.url).origin);
  c.set("auth", auth);
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", result?.user ?? null);
  c.set("session", result?.session ?? null);
  await next();
});

// ログイン必須ルート用ガード
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});
