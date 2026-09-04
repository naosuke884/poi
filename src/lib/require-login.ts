import { authClient } from "@/lib/auth-client";
import { clearBoardCache } from "@/lib/board-cache";
import { clearCollapsed } from "@/lib/collapsed-sections";
import { isNetworkError } from "@/lib/offline";
import { clearCachedUser, readCachedUser, writeCachedUser, type CachedUser } from "@/lib/session-cache";

// beforeLoad の戻り値 (ルートの context にマージされる)。
// オンラインなら Better Auth のセッション、オフラインなら前回キャッシュしたユーザー情報 (未ログインなら null)。
// どちらも user.id / name / email / image を持つので、loader や画面はこの形だけを見ればよい。
export type LoginContext = { session: { user: CachedUser } | null };

// ログイン状態を調べる beforeLoad 用のガード。未ログインでも redirect しない
// (トップはログインしていなければランディングページを見せる。issue #24)。
// 戻り値はルートの context にマージされる (Route.useRouteContext() で session を参照できる)。
//
// オフライン (getSession の fetch 自体が失敗) のときは、前回ログイン時にキャッシュした
// ユーザー情報で通す。loader 側はキャッシュ済みの板を表示する (src/lib/board-cache.ts)。
// サーバが「未ログイン」と答えた場合とは区別する (その場合は端末のキャッシュを消して未ログイン扱い)
export async function optionalLogin(): Promise<LoginContext> {
  let result: Awaited<ReturnType<typeof authClient.getSession>>;
  try {
    result = await authClient.getSession();
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const cached = readCachedUser();
    return { session: cached ? { user: cached } : null };
  }
  const { data, error } = result;
  if (!data) {
    // サーバが「未ログイン」と答えた (セッション切れを含む)。
    // 他人に見えないよう、この端末に残るオフライン閲覧用キャッシュは消しておく
    if (!error) {
      const stale = readCachedUser();
      clearCachedUser();
      if (stale) {
        clearBoardCache(stale.id);
        clearCollapsed(stale.id);
      }
    }
    return { session: null };
  }
  writeCachedUser(data.user);
  return { session: data };
}
