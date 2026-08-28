import { readJson, removeByPrefix, writeJson } from "@/lib/local-storage";
import type { BoardLine } from "@/lib/board";

// オフライン閲覧用の板のキャッシュ (localStorage)。
// - 取得 / 保存が成功するたびに上書きし、loader が fetch に失敗したときだけ読む
// - キーはユーザー id ごとに分ける (別アカウントでログインし直しても混ざらない)
// - ログアウト時は clearBoardCache(userId) で消す
//
// あくまで「前回取得した内容の表示」用で、オフラインで行った編集の保存先ではない
// (Board はオンライン復帰時に API へ再送する)。

const PREFIX = "poi:board-cache:v1:";

const boardKey = (userId: string) => `${PREFIX}${userId}`;

export type CachedBoard = { lines: BoardLine[]; cachedAt: number };

export function readCachedBoard(userId: string, now = Date.now()): CachedBoard | null {
  const cached = readJson<CachedBoard>(boardKey(userId));
  if (!cached || !Array.isArray(cached.lines)) return null;
  // サーバ側の「未期限切れのみ」と同じ条件。オフラインでも期限を過ぎた行は見せない
  return { ...cached, lines: cached.lines.filter((l) => new Date(l.expiresAt).getTime() > now) };
}

export function writeCachedBoard(userId: string, lines: BoardLine[], now = Date.now()): void {
  writeJson(boardKey(userId), { lines, cachedAt: now } satisfies CachedBoard);
}

/** そのユーザーのキャッシュを消す (ログアウト時)。userId 省略で全ユーザー分 */
export function clearBoardCache(userId?: string): void {
  removeByPrefix(userId === undefined ? PREFIX : boardKey(userId));
}
