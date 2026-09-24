import { readJson, removeItem, writeJson } from "@/lib/local-storage";

// オフライン起動時に「誰としてログインしていたか」を復元するためのキャッシュ。
// requireLogin が getSession に成功するたびに上書きし、未ログイン判定 / ログアウトで消す。
// セッショントークン自体は Cookie にあるので、ここには表示用のユーザー情報だけを置く。

const KEY = "poi:session:v1";

export type CachedUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export function readCachedUser(): CachedUser | null {
  const user = readJson<CachedUser>(KEY);
  return user && typeof user.id === "string" ? user : null;
}

export function writeCachedUser(user: {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}): void {
  writeJson(KEY, {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
  } satisfies CachedUser);
}

export function clearCachedUser(): void {
  removeItem(KEY);
}
