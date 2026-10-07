import { readJson, removeItem, writeJson } from "@/lib/local-storage";

// オフライン起動時に「誰としてログインしていたか」を復元するためのキャッシュ。
// getLoginState (board/-lib/data/login-state.ts) が getSession に成功するたびに上書きし、未ログイン判定 / ログアウトで消す。
// セッショントークン自体は Cookie にあるので、ここには表示用のユーザー情報だけを置く。
// メールアドレスは置かない (オフラインのヘッダー表示には名前とアイコンで足りる。端末に残す個人情報を減らす。issue #116)

// public/boot.js も同じキーを見る (ログイン済みならランディングを描く前に板へ)
const KEY = "poi:session:v1";

export type CachedUser = {
  id: string;
  name: string;
  image: string | null;
};

const toCachedUser = (user: { id: string; name: string; image?: string | null }): CachedUser => ({
  id: user.id,
  name: user.name,
  image: user.image ?? null,
});

export function readCachedUser(): CachedUser | null {
  const user = readJson<CachedUser & { email?: unknown }>(KEY);
  if (!user || typeof user.id !== "string") return null;
  // メールアドレスを保存していた頃のキャッシュは、読んだときにメールアドレスを除いて書き戻す
  if ("email" in user) writeCachedUser(user);
  return toCachedUser(user);
}

export function writeCachedUser(user: { id: string; name: string; image?: string | null }): void {
  writeJson(KEY, toCachedUser(user));
}

export function clearCachedUser(): void {
  removeItem(KEY);
}
