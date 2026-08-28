import { redirect } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { clearMemoCache } from "@/lib/memo-cache";
import { OfflineError, isNetworkError } from "@/lib/offline";
import { clearCachedUser, readCachedUser, writeCachedUser, type CachedUser } from "@/lib/session-cache";

// ログイン必須ルートの beforeLoad の戻り値 (ルートの context にマージされる)。
// オンラインなら Better Auth のセッション、オフラインなら前回キャッシュしたユーザー情報。
// どちらも user.id / name / email / image を持つので、loader や画面はこの形だけを見ればよい。
export type LoginContext = { session: { user: CachedUser } };

// ログイン必須ルートの beforeLoad で使うガード。
// 未ログインなら /login へ redirect し、戻り先を search.redirect に保持する。
// 戻り値はルートの context にマージされる (Route.useRouteContext() で session を参照できる)。
//
// オフライン (getSession の fetch 自体が失敗) のときは、前回ログイン時にキャッシュした
// ユーザー情報で通す。loader 側はキャッシュ済みのメモを表示する (src/lib/memo-cache.ts)。
// サーバが「未ログイン」と答えた場合とは区別する (その場合はキャッシュを消して /login へ)。
export async function requireLogin(location: { href: string }): Promise<LoginContext> {
  let result: Awaited<ReturnType<typeof authClient.getSession>>;
  try {
    result = await authClient.getSession();
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const cached = readCachedUser();
    if (cached) return { session: { user: cached } };
    throw new OfflineError(
      "オフラインのため、ログイン状態を確認できません。オンラインに戻ってから再度お試しください。",
    );
  }
  const { data, error } = result;
  if (!data) {
    // サーバが「未ログイン」と答えた (セッション切れを含む)。
    // 他人に見えないよう、この端末に残るオフライン閲覧用キャッシュは消しておく
    if (!error) {
      const stale = readCachedUser();
      clearCachedUser();
      if (stale) clearMemoCache(stale.id);
    }
    throw redirect({ to: "/login", search: { redirect: location.href } });
  }
  writeCachedUser(data.user);
  return { session: data };
}
