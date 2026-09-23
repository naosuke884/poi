import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { type Auth, createAuth, type Session } from "./auth";

export type AppEnv = {
  Bindings: Env;
  Variables: {
    auth: Auth;
    user: Session["user"] | null;
    session: Session["session"] | null;
  };
};

// requireAuth を通った後の Env。user / session は必ずある
// (`.use(requireAuth)` したルートでは AppEnv と合わさって c.get("user") が non-null になる)
export type AuthedEnv = {
  Variables: {
    user: Session["user"];
    session: Session["session"];
  };
};

// リクエストごとに Better Auth インスタンスを生成し、セッションを解決する。
// /api/auth/* は Better Auth のハンドラに渡すだけなので、セッションは解決しない (DB 参照を省く)
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const auth = createAuth(c.env, new URL(c.req.url).origin);
  c.set("auth", auth);
  if (c.req.path.startsWith("/api/auth/")) {
    c.set("user", null);
    c.set("session", null);
    await next();
    return;
  }
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", result?.user ?? null);
  c.set("session", result?.session ?? null);
  await next();
});

// ログイン必須ルート用ガード。未ログインならここで 401 を返すので、後続では user が null にならない。
// その保証を型に載せるため、本体は AppEnv で書いて AuthedEnv のミドルウェアとして公開する
export const requireAuth: MiddlewareHandler<AuthedEnv> = createMiddleware<AppEnv>(
  async (c, next) => {
    if (!c.get("user") || !c.get("session")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  },
) as MiddlewareHandler as MiddlewareHandler<AuthedEnv>;
