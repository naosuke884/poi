import { redirect } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

// ログイン必須ルートの beforeLoad で使うガード。
// 未ログインなら /login へ redirect し、戻り先を search.redirect に保持する。
// 戻り値はルートの context にマージされる (Route.useRouteContext() で session を参照できる)。
export async function requireLogin(location: { href: string }) {
  const { data } = await authClient.getSession();
  if (!data) {
    throw redirect({ to: "/login", search: { redirect: location.href } });
  }
  return { session: data };
}
