import { createAuthClient } from "better-auth/react";
import { multiSessionClient } from "better-auth/client/plugins";

// 同一オリジンの /api/auth を叩くので baseURL 指定は不要。
// multiSession: アカウント切り替え (UserMenu)。setActive が useSession の再取得も発火する
export const authClient = createAuthClient({ plugins: [multiSessionClient()] });

export type Session = typeof authClient.$Infer.Session;
