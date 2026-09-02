import { readJson, removeByPrefix, writeJson } from "@/lib/local-storage";

// 折り畳んだセクションの記録 (localStorage)。
// - サーバに保存済みのセクションの id の配列で持つ (未保存のセクションの折り畳みは画面内だけ)。
//   id は保存し直しても変わらないので、次に開いたときも同じセクションが折り畳まれる (端末ごと)
// - キーはユーザー id ごとに分け、ログアウト / セッション切れ時は板のキャッシュと一緒に消す
// - 板に無くなった id は Board が開いたとき / 保存したときに書き直して落とす

const PREFIX = "poi:collapsed:v1:";

const collapsedKey = (userId: string) => `${PREFIX}${userId}`;

export function readCollapsedIds(userId: string): string[] {
  const ids = readJson<string[]>(collapsedKey(userId));
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

export function writeCollapsedIds(userId: string, ids: string[]): void {
  writeJson(collapsedKey(userId), ids);
}

/** そのユーザーの記録を消す (ログアウト時)。userId 省略で全ユーザー分 */
export function clearCollapsed(userId?: string): void {
  removeByPrefix(userId === undefined ? PREFIX : collapsedKey(userId));
}
