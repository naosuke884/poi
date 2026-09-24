import { readJson, writeJson } from "@/lib/local-storage";
import { boardCacheKey } from "@/lib/offline-caches";
import type { BoardSection } from "./board";

// オフライン閲覧用の板のキャッシュ (localStorage)。
// - 取得 / 保存が成功するたびに上書きし、loader が fetch に失敗したときだけ読む。
//   ただし今のキャッシュより古い内容では上書きしない (writeCachedBoard の asOf)
// - キーはユーザー id ごとに分ける (別アカウントでログインし直しても混ざらない)
// - ログアウト時などは clearOfflineCaches (src/lib/offline-caches.ts) 経由で消す。
//   ヘッダーからも消すので、キーはそちらで定義している (boardCacheKey)
//
// あくまで「前回取得した内容の表示」用で、オフラインで行った編集の保存先ではない
// (Board はオンライン復帰時に API へ再送する)。

/** cachedAt は内容がサーバの最新だったと分かっている時刻 (writeCachedBoard の asOf) */
export type CachedBoard = { sections: BoardSection[]; cachedAt: number };

export function readCachedBoard(userId: string, now = Date.now()): CachedBoard | null {
  const cached = readJson<CachedBoard>(boardCacheKey(userId));
  if (!cached || !Array.isArray(cached.sections)) return null;
  // サーバ側の「未期限切れのみ」と同じ条件。オフラインでも期限を過ぎたセクションは見せない
  return {
    ...cached,
    sections: cached.sections.filter((s) => new Date(s.expiresAt).getTime() > now),
  };
}

/**
 * キャッシュを書く。asOf は内容がサーバの最新だったと分かっている時刻: 取得 (GET) なら送った時刻
 * (サーバが読んだのはそれ以降)、保存 (PUT) なら返ってきた時刻 (保存した内容がそのまま最新)。
 * 今のキャッシュの方が新しければ書かない: オンライン復帰時の取り直し (GET) と未保存分の再送 (PUT) が
 * 同時に走り、PUT より前の板を読んだ GET が後から返ってきても、保存済みの内容を古い内容で上書きしない
 */
export function writeCachedBoard(
  userId: string,
  sections: BoardSection[],
  asOf = Date.now(),
): void {
  const current = readJson<CachedBoard>(boardCacheKey(userId));
  if (current && typeof current.cachedAt === "number" && current.cachedAt > asOf) return;
  writeJson(boardCacheKey(userId), { sections, cachedAt: asOf } satisfies CachedBoard);
}
