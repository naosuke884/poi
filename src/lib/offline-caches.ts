import {
  keysWithPrefix,
  readJson,
  removeByPrefix,
  removeItem,
  writeJson,
} from "@/lib/local-storage";
import { clearCachedUser } from "@/lib/session-cache";

// この端末に残るオフライン閲覧用キャッシュのキーと、その消去。
// 板の中身の読み書きは (board) の board-cache.ts が行うが、ログアウト / アカウント削除 (ヘッダー) からも
// 消すので、消すのに要るキーだけをここに置く (板の型には依存しない)

// v1 は行単位 ({ lines }) だった (本番公開前の形式)。形式を変えたのでキーごと切り替えている
const BOARD_CACHE_BASE_PREFIX = "poi:board-cache:";
const BOARD_CACHE_PREFIX = `${BOARD_CACHE_BASE_PREFIX}v2:`;

/** そのユーザーの板のキャッシュのキー */
export const boardCacheKey = (userId: string) => `${BOARD_CACHE_PREFIX}${userId}`;

// この端末に残るオフライン閲覧用キャッシュ (ユーザー情報と、userIds の各ユーザーの板) を消す。
// サーバが「未ログイン」と答えた (セッション切れを含む) とき、ログアウト / アカウント削除のときに、
// 他人に見えないよう呼ぶ。userIds を省略すると、この端末の全ユーザーの板を消す
// (multiSession で他のアカウントの板もキャッシュしていることがあるため。古い形式のキーも含めて)
export function clearOfflineCaches(userIds?: string[]): void {
  clearCachedUser();
  if (userIds === undefined) removeByPrefix(BOARD_CACHE_BASE_PREFIX);
  else for (const id of userIds) removeItem(boardCacheKey(id));
}

// 期限切れを判定するのに要る分だけの形 (板の型には依存しない。board-cache.ts の CachedBoard はこれを満たす)
type ExpiringBoardCache = { sections: { expiresAt: string }[] };

/**
 * key の板のキャッシュから期限を過ぎたセクションを除き、除いたものがあれば書き戻す (issue #115)。
 * 表示から外すだけだと本文が端末に残り、「N 日で消える」と食い違うため。
 * 条件はサーバ側の「未期限切れのみ」と同じ (expiresAt > now)。形式が壊れていれば消して null
 */
export function pruneBoardCache<T extends ExpiringBoardCache>(key: string, now: number): T | null {
  const cached = readJson<T>(key);
  if (!cached || !Array.isArray(cached.sections)) {
    if (cached !== null) removeItem(key);
    return null;
  }
  const sections = cached.sections.filter((s) => new Date(s.expiresAt).getTime() > now);
  if (sections.length === cached.sections.length) return cached;
  const pruned = { ...cached, sections };
  writeJson(key, pruned);
  return pruned;
}

// 起動時に、この端末にある全ユーザーの板のキャッシュから期限切れのセクションを消す (issue #115)。
// キャッシュは取得に失敗したときしか読まないので、読むときの書き戻しだけでは、オンラインで使い続ける
// ユーザーや、この端末で使わなくなった別アカウントの板に期限切れの本文が残る。古い形式のキーは丸ごと消す
export function pruneBoardCaches(now = Date.now()): void {
  for (const key of keysWithPrefix(BOARD_CACHE_BASE_PREFIX)) {
    if (key.startsWith(BOARD_CACHE_PREFIX)) pruneBoardCache(key, now);
    else removeItem(key);
  }
}
