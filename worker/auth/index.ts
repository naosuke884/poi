import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { multiSession } from "better-auth/plugins/multi-session";

import { createDb, schema } from "../db";

// Google から受け取るトークンは、ログインの処理の中で使うだけで、保存はしない。アプリは Google API を呼ばないので、
// 残しても使い道がなく、漏れたときに Google アカウントへのアクセスに使われうるものを持ち続けるだけになる。
// encryptOAuthTokens で暗号化して残す手もあるが、使わないものは持たないほうが安全 (HAY-37)
const DROPPED_OAUTH_TOKENS = { accessToken: null, refreshToken: null, idToken: null };

export function createAuth(env: Env, requestOrigin: string) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL ?? requestOrigin,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(createDb(env.DB), { provider: "sqlite", schema }),
    // OAuth の state cookie 照合は省かない。省くと、攻撃者が用意したコールバック URL を踏ませて
    // 攻撃者のアカウントでログインさせる login CSRF が通る。照合が通らない X などのアプリ内ブラウザでは、
    // ランディングがログインボタンの代わりにブラウザで開き直す案内を出す (LoginCta、HAY-42)
    // 新しい account 行にも、ログインのたびの更新 (updateAccountOnSignIn) にもトークンを書かせない
    databaseHooks: {
      account: {
        create: { before: async (account) => ({ data: { ...account, ...DROPPED_OAUTH_TOKENS } }) },
        update: { before: async (account) => ({ data: { ...account, ...DROPPED_OAUTH_TOKENS } }) },
      },
    },
    // メニューの「アカウント削除」から使う。板の内容 (memo) は user への
    // FK (ON DELETE cascade) で一緒に消える。パスワードを持たない Google ログインでは
    // セッションの鮮度 (ログインから 1 日以内) が本人確認の代わりになる
    user: { deleteUser: { enabled: true } },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        // メニューの「アカウントを追加」から 2 つ目の Google アカウントでログインするとき、
        // Google が今のアカウントを黙って再利用しないよう毎回アカウント選択画面を出す
        prompt: "select_account",
      },
    },
    // アカウント切り替え。ログイン中に別アカウントでログインしても前のセッションが cookie に残り、
    // メニューから即座に切り替えられる。ログアウトはこの端末の全アカウントを一括で外す (プラグインの仕様)
    plugins: [multiSession()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
