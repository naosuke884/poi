import type { Context, MiddlewareHandler } from "hono";

import type { AppEnv } from "./types";

/**
 * Workers Rate Limiting の binding (wrangler.jsonc の ratelimits) で数え、上限を超えたら
 * 429 { error: "TooManyRequests" } で断るミドルウェア。key が null のリクエストは数えない
 * (未ログインの PUT は後の requireAuth が 401 で断るので、ここで数える相手がいない)
 */
export function rateLimit(
  limiter: (env: Env) => RateLimit,
  key: (c: Context<AppEnv>) => string | null | undefined,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const k = key(c);
    if (k) {
      const { success } = await limiter(c.env).limit({ key: k });
      if (!success) return c.json({ error: "TooManyRequests" }, 429);
    }
    await next();
  };
}
