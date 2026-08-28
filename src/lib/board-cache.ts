import { readJson, removeByPrefix, writeJson } from "@/lib/local-storage";
import type { BoardSection } from "@/lib/board";

// オフライン閲覧用の板のキャッシュ (localStorage)。
// - 取得 / 保存が成功するたびに上書きし、loader が fetch に失敗したときだけ読む
// - キーはユーザー id ごとに分ける (別アカウントでログインし直しても混ざらない)
// - ログアウト時は clearBoardCache(userId) で消す
//
// あくまで「前回取得した内容の表示」用で、オフラインで行った編集の保存先ではない
// (Board はオンライン復帰時に API へ再送する)。

// v1 は行単位 ({ lines }) だった。形式を変えたのでキーごと切り替え、v1 は読まない (clear では一緒に消す)
const BASE_PREFIX = "poi:board-cache:";
const PREFIX = `${BASE_PREFIX}v2:`;

const boardKey = (userId: string) => `${PREFIX}${userId}`;

export type CachedBoard = { sections: BoardSection[]; cachedAt: number };

export function readCachedBoard(userId: string, now = Date.now()): CachedBoard | null {
  const cached = readJson<CachedBoard>(boardKey(userId));
  if (!cached || !Array.isArray(cached.sections)) return null;
  // サーバ側の「未期限切れのみ」と同じ条件。オフラインでも期限を過ぎたセクションは見せない
  return {
    ...cached,
    sections: cached.sections.filter((s) => new Date(s.expiresAt).getTime() > now),
  };
}

export function writeCachedBoard(userId: string, sections: BoardSection[], now = Date.now()): void {
  writeJson(boardKey(userId), { sections, cachedAt: now } satisfies CachedBoard);
}

/** そのユーザーのキャッシュを消す (ログアウト時)。userId 省略で全ユーザー分 */
export function clearBoardCache(userId?: string): void {
  if (userId === undefined) {
    removeByPrefix(BASE_PREFIX);
    return;
  }
  removeByPrefix(boardKey(userId));
  // 旧形式のキーが残っていれば一緒に消す
  removeByPrefix(`${BASE_PREFIX}v1:${userId}`);
}
