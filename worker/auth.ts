import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { multiSession } from "better-auth/plugins/multi-session";
import { createDb, schema } from "./db";
import { isInAppBrowser } from "./in-app-browser";

export function createAuth(env: Env, requestOrigin: string, userAgent?: string | null) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL ?? requestOrigin,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(createDb(env.DB), { provider: "sqlite", schema }),
    // X などのアプリ内ブラウザでは state cookie が OAuth コールバックに乗らず state_mismatch になるので、
    // そのブラウザからのコールバックに限って cookie 照合を省く (state 自体は DB で単回使用・10 分期限で検証される)。
    // 照合を省くと、攻撃者が用意したコールバック URL を踏ませて攻撃者のアカウントでログインさせる
    // login CSRF が通るため、普通のブラウザでは照合を残す
    account: { skipStateCookieCheck: isInAppBrowser(userAgent) },
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
