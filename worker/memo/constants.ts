// 行の保持期間。「1 ヶ月」は 30 日固定とし、暦月は扱わない。
// UI 側 (src/) からもこのファイルを参照して期限日などを表示する。
export const MEMO_TTL_DAYS = 30;
export const MEMO_TTL_MS = MEMO_TTL_DAYS * 24 * 60 * 60 * 1000;

// バリデーション上限。API (worker/memo/routes.ts) と UI (Textarea の maxLength / 文字数カウンタ) で共有する
// 板全体の文字数 (改行を含む)
export const BOARD_MAX_LENGTH = 20_000;
// 板の行数
export const BOARD_MAX_LINES = 1_000;

/** 作成日時から有効期限を計算する */
export function memoExpiresAt(createdAt: Date = new Date()): Date {
  return new Date(createdAt.getTime() + MEMO_TTL_MS);
}
