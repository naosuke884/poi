// メモの保持期間。「1 ヶ月」は 30 日固定とし、暦月は扱わない。
// UI 側 (src/) からもこのファイルを参照して残り日数などを計算する。
export const MEMO_TTL_DAYS = 30;
export const MEMO_TTL_MS = MEMO_TTL_DAYS * 24 * 60 * 60 * 1000;

// バリデーション上限。API (worker/memo/routes.ts) と UI の文字数カウンタで共有する
export const MEMO_TITLE_MAX_LENGTH = 200;
export const MEMO_CONTENT_MAX_LENGTH = 20_000;

/** 作成日時から有効期限を計算する */
export function memoExpiresAt(createdAt: Date = new Date()): Date {
  return new Date(createdAt.getTime() + MEMO_TTL_MS);
}
