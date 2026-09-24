import type { Auth, Session } from "./auth";

// Hono アプリ全体の Env。Variables は authMiddleware (auth/middleware.ts) がリクエストごとに詰める
export type AppEnv = {
  Bindings: Env;
  Variables: {
    auth: Auth;
    user: Session["user"] | null;
    session: Session["session"] | null;
  };
};
