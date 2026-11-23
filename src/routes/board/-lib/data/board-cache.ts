import { readJson, writeJson } from "@/lib/local-storage";
import { boardCacheKey, pruneBoardCache } from "@/lib/offline-caches";
import { readCachedUser } from "@/lib/session-cache";

import type { BoardSection } from "./board";
import type { Tag } from "./tags";

// オフライン閲覧用の板のキャッシュ (localStorage)。
// - 取得 / 保存が成功するたびに上書きし、loader が fetch に失敗したときだけ読む。
//   ただし今のキャッシュより古い内容では上書きしない (writeCachedBoard の asOf)
// - キーはユーザー id ごとに分ける (別アカウントでログインし直しても混ざらない)
// - ログアウト時などは clearOfflineCaches (src/lib/offline-caches.ts) 経由で消す。
//   ヘッダーからも消すので、キーはそちらで定義している (boardCacheKey)
//
// あくまで「前回取得した内容の表示」用で、オフラインで行った編集の保存先ではない
// (Board はオンライン復帰時に API へ再送する)。

/**
 * cachedAt は内容がサーバの最新だったと分かっている時刻 (writeCachedBoard の asOf)。
 * tags は登録済みのタグ (オフラインでもセクションのタグの名前と絞り込みを出すため)
 */
export type CachedBoard = { sections: BoardSection[]; cachedAt: number; tags: Tag[] };

export function readCachedBoard(userId: string, now = Date.now()): CachedBoard | null {
  // オフラインでも期限を過ぎたセクションは見せず、端末からも消す (書き戻す。issue #115)
  const cached = pruneBoardCache<CachedBoard>(boardCacheKey(userId), now);
  if (!cached) return null;
  // 本文が文字列でないセクションは読まない (壊れたキャッシュ。描くときに落ちて、閲覧のみの板も出せなくなる)
  const sections = cached.sections.filter((s) => typeof s.content === "string");
  return { ...cached, sections, tags: tagsOf(cached) };
}

/**
 * キャッシュの登録済みのタグ (id と名前のあるものだけ)。タグの導入前に書いたキャッシュには無い
 * (そのころのセクションは tagId も持たないので、タグなしで出る)
 */
const tagsOf = (cached: Partial<CachedBoard> | null): Tag[] =>
  Array.isArray(cached?.tags)
    ? cached.tags.filter(
        (t): t is Tag =>
          typeof t === "object" &&
          t !== null &&
          typeof t.id === "string" &&
          typeof t.name === "string",
      )
    : [];

/**
 * キャッシュを書く。asOf は内容がサーバの最新だったと分かっている時刻: 取得 (GET) なら送った時刻
 * (サーバが読んだのはそれ以降)、保存 (PUT) なら返ってきた時刻 (保存した内容がそのまま最新)。
 * 今のキャッシュの方が新しければ書かない: オンライン復帰時の取り直し (GET) と未保存分の再送 (PUT) が
 * 同時に走り、PUT より前の板を読んだ GET が後から返ってきても、保存済みの内容を古い内容で上書きしない。
 * tags を渡さなければ (保存の返事は登録済みのタグを含まない)、キャッシュにある一覧のままにする
 */
export function writeCachedBoard(
  userId: string,
  board: { sections: BoardSection[]; tags?: Tag[] },
  asOf = Date.now(),
): void {
  const current = readJson<Partial<CachedBoard>>(boardCacheKey(userId));
  if (current && typeof current.cachedAt === "number" && current.cachedAt > asOf) return;
  writeJson(boardCacheKey(userId), {
    sections: board.sections,
    cachedAt: asOf,
    tags: board.tags ?? tagsOf(current),
  } satisfies CachedBoard);
}

/**
 * キャッシュの登録済みのタグだけを書き換える (開いている板の一覧が変わったとき。useBoardTags が持つ一覧と同じにする)。
 * キャッシュがまだ無ければ何もしない (次に板を取得したときに一緒に書く)。
 * ログイン中のユーザーが userId でなければ (ログアウト / 切り替えの後に届いた返事) 書かない: 消したキャッシュに書き足さない
 */
export function writeCachedTags(userId: string, tags: Tag[]): void {
  if (readCachedUser()?.id !== userId) return;
  const current = readJson<CachedBoard>(boardCacheKey(userId));
  if (!current || !Array.isArray(current.sections)) return;
  writeJson(boardCacheKey(userId), { ...current, tags } satisfies CachedBoard);
}
