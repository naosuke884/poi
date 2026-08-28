import { keysWithPrefix, readJson, removeByPrefix, removeItem, writeJson } from "@/lib/local-storage";
import type { MemoDetail, MemoListItem } from "@/lib/memo";

// オフライン閲覧用のメモキャッシュ (localStorage)。
// - 一覧 / 1 件取得が成功するたびに上書きし、loader が fetch に失敗したときだけ読む
// - キーはユーザー id ごとに分ける (別アカウントでログインし直しても混ざらない)
// - 一覧を書くときに、一覧に無い id の詳細キャッシュは消す (期限切れ・削除済みが残らないように)
// - ログアウト時は clearMemoCache(userId) で全部消す
//
// あくまで「前回取得した内容の表示」用で、オフラインで行った編集の保存先ではない
// (編集画面はオンライン復帰時に API へ再送する)。

const PREFIX = "poi:memo-cache:v1:";

const userPrefix = (userId: string) => `${PREFIX}${userId}:`;
const listKey = (userId: string) => `${userPrefix(userId)}list`;
const memoKeyPrefix = (userId: string) => `${userPrefix(userId)}memo:`;
const memoKey = (userId: string, id: string) => `${memoKeyPrefix(userId)}${id}`;

export type CachedMemoList = { memos: MemoListItem[]; cachedAt: number };
export type CachedMemo = { memo: MemoDetail; cachedAt: number };

export function readCachedMemoList(userId: string): CachedMemoList | null {
  const cached = readJson<CachedMemoList>(listKey(userId));
  return cached && Array.isArray(cached.memos) ? cached : null;
}

export function writeCachedMemoList(userId: string, memos: MemoListItem[], now = Date.now()): void {
  writeJson(listKey(userId), { memos, cachedAt: now } satisfies CachedMemoList);
  // 一覧に含まれないメモの詳細キャッシュは古いので捨てる
  const alive = new Set(memos.map((m) => m.id));
  const prefix = memoKeyPrefix(userId);
  for (const key of keysWithPrefix(prefix)) {
    if (!alive.has(key.slice(prefix.length))) removeItem(key);
  }
}

export function readCachedMemo(userId: string, id: string): CachedMemo | null {
  const cached = readJson<CachedMemo>(memoKey(userId, id));
  return cached && cached.memo && cached.memo.id === id ? cached : null;
}

export function writeCachedMemo(userId: string, memo: MemoDetail, now = Date.now()): void {
  writeJson(memoKey(userId, memo.id), { memo, cachedAt: now } satisfies CachedMemo);
}

export function removeCachedMemo(userId: string, id: string): void {
  removeItem(memoKey(userId, id));
}

/** そのユーザーのキャッシュをすべて消す (ログアウト時)。userId 省略で全ユーザー分 */
export function clearMemoCache(userId?: string): void {
  removeByPrefix(userId === undefined ? PREFIX : userPrefix(userId));
}
