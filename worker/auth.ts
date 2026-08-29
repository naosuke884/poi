import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createDb, schema } from "./db";

export function createAuth(env: Env, requestOrigin: string) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL ?? requestOrigin,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(createDb(env.DB), { provider: "sqlite", schema }),
    // X などのアプリ内ブラウザでは state cookie が OAuth コールバックに乗らず state_mismatch になる。
    // state は DB 側で単回使用・10 分期限・PKCE 付きで検証されるので、cookie 照合だけをスキップする
    account: { skipStateCookieCheck: true },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
