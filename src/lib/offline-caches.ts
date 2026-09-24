import { removeByPrefix, removeItem } from "@/lib/local-storage";
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
