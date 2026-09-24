import { multiSessionClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// 同一オリジンの /api/auth を叩くので baseURL 指定は不要。
// multiSession: アカウント切り替え (UserMenu)。setActive が useSession の再取得も発火する
export const authClient = createAuthClient({ plugins: [multiSessionClient()] });

// Google OAuth を開始する (Landing のログインと UserMenu のアカウント追加で共通)。
// 成功するとそのまま Google へ遷移する。開始できなかったとき (オフライン等) は throw する
export async function startGoogleLogin(): Promise<void> {
  const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
  if (error) throw error;
}
