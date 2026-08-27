// @better-auth/cli (npm run auth:schema) 用の設定。
// スキーマ生成にはアダプタ種別とプラグイン構成だけが必要なので、ダミーの env を渡す。
import { createAuth } from "./worker/auth";

export const auth = createAuth(
  {
    DB: {} as D1Database,
    ASSETS: {} as Fetcher,
    BETTER_AUTH_SECRET: "dummy",
    GOOGLE_CLIENT_ID: "dummy",
    GOOGLE_CLIENT_SECRET: "dummy",
  },
  "http://localhost:5173",
);
