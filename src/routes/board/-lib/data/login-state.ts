import { authClient } from "@/lib/auth-client";
import { isNetworkError } from "@/lib/offline";
import { clearOfflineCaches } from "@/lib/offline-caches";
import { type CachedUser, readCachedUser, writeCachedUser } from "@/lib/session-cache";

// ログイン状態 (loadBoardPage が板の取得に使う)。
// オンラインなら Better Auth のセッション、オフラインなら前回キャッシュしたユーザー情報 (未ログインなら null)。
// どちらも user.id / name / image を持つので、loader や画面はこの形だけを見ればよい。
export type LoginContext = { session: { user: CachedUser } | null };

// ログイン状態を調べる。未ログインなら session: null (板の loader がランディングへ戻す)。
// beforeLoad ではなく loader の中で呼ぶ: beforeLoad だと、これが済むまで画面のチャンクの取得が始まらないため (issue #110)。
//
// オフライン (getSession の fetch 自体が失敗) のときは、前回ログイン時にキャッシュした
// ユーザー情報で通す。loader 側はキャッシュ済みの板を表示する (board-cache.ts)。
// サーバが「未ログイン」と答えた場合は端末のキャッシュを消して未ログイン扱いにする。
// サーバがエラーを返した場合は未ログイン扱いにせず投げる: ユーザー情報のキャッシュが残ったままランディングへ戻すと、
// ランディングがそれを見て板へ転送し、行き来が止まらなくなる (issue #156)
export async function getLoginState(): Promise<LoginContext> {
  let result: Awaited<ReturnType<typeof authClient.getSession>>;
  try {
    result = await authClient.getSession();
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const cached = readCachedUser();
    return { session: cached ? { user: cached } : null };
  }
  const { data, error } = result;
  if (error) throw new Error("ログイン状態を確認できませんでした");
  if (!data) {
    // サーバが「未ログイン」と答えた (セッション切れを含む)
    clearOfflineCaches();
    return { session: null };
  }
  writeCachedUser(data.user);
  return { session: data };
}
