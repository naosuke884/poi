// `wrangler types` が生成する Env (bindings) に、シークレットの型をマージする。
// 値は .dev.vars (ローカル) / `wrangler secret put` (本番) で設定する。
interface Env {
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** 省略時はリクエストの origin を使う */
  BETTER_AUTH_URL?: string;
}
