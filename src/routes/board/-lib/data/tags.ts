import { TAG_MAX_REGISTERED } from "@shared/constants";
import type { InferResponseType } from "hono/client";

import { api } from "@/lib/api";

/** 登録済みのタグ 1 つ (id・名前・アイコン)。/api/tags と GET /api/board が登録した順の配列で返す */
export type Tag = InferResponseType<typeof api.tags.$get, 200>["tags"][number];

// 登録済みのタグ (/api/tags) の取得・登録・名前の変更・削除。どれも変えた後の一覧 (登録した順) を返す。
// 失敗したときは、そのまま画面に出せる文言の Error を投げる (ブラウザやサーバの文言は出さない)

/** 登録済みのタグを取り直す (別の端末で登録・削除されたものを、タグを選ぶ欄に反映する) */
export async function fetchTags(): Promise<Tag[]> {
  const res = await api.tags.$get();
  if (!res.ok) throw new Error("タグを取得できませんでした");
  return (await res.json()).tags;
}

/**
 * タグを変える要求を送り、変えた後の一覧を返す。断られたらサーバの返すエラーの種類 (error) で文言を選び
 * (reasons に無い種類と、届かなかったときは failed)、その文言の Error を投げる。
 * 状態コードではなく種類で分けるのは、同じ 409 に別の理由 (上限・名前の重複) があるため
 */
async function send(
  request: () => Promise<{ ok: boolean; json(): Promise<unknown> }>,
  failed: string,
  reasons: Partial<Record<string, string>> = {},
): Promise<Tag[]> {
  let res;
  try {
    res = await request();
  } catch {
    throw new Error(failed);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error((body.error !== undefined && reasons[body.error]) || failed);
  }
  return ((await res.json()) as { tags: Tag[] }).tags;
}

/** タグを登録する。もう同じ名前で登録されていれば何も起きない (作ったタグは、返す一覧から名前で探す) */
export function registerTag(name: string): Promise<Tag[]> {
  return send(
    () => api.tags.$post({ json: { name } }),
    "タグを登録できませんでした。接続を確認して、もう一度お試しください。",
    {
      TooManyTags: `タグは ${TAG_MAX_REGISTERED} 個までです。使わないタグの登録を消してください。`,
    },
  );
}

/** タグの登録を消す。そのタグを付けていたセクションからも外れる (サーバ側) */
export function unregisterTag(id: string): Promise<Tag[]> {
  return send(
    () => api.tags.$delete({ json: { id } }),
    "タグの登録を消せませんでした。接続を確認して、もう一度お試しください。",
  );
}

/** タグの名前を変える。セクションは id で指しているので、付けていたセクションもそのまま新しい名前で出る */
export function renameTag(tag: Pick<Tag, "id" | "name">, newName: string): Promise<Tag[]> {
  return send(
    () => api.tags.$patch({ json: { id: tag.id, name: newName } }),
    "タグの名前を変えられませんでした。接続を確認して、もう一度お試しください。",
    {
      TagExists: `「${newName}」というタグはもうあります。別の名前にしてください。`,
      TagNotFound: `「${tag.name}」というタグは、別の場所で登録が消されています。`,
    },
  );
}
