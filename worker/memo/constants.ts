// セクションの保持期間。「1 ヶ月」は 30 日固定とし、暦月は扱わない。
// UI 側 (src/) からもこのファイルを参照して期限日などを表示する。
export const MEMO_TTL_DAYS = 30;
export const MEMO_TTL_MS = MEMO_TTL_DAYS * 24 * 60 * 60 * 1000;

// セクションの区切り (= 改行 3 つ = 空行 2 つ)。空行 1 つはセクションの中に含めてよい。
// UI はエディタにこれが入力されたらそこでセクションを分け、API はセクションの内容にこれが含まれないことを検証する
export const SECTION_SEPARATOR = "\n\n\n";

// バリデーション上限。API (worker/memo/routes.ts) と UI (文字数カウンタ / 保存前チェック) で共有する
// 板全体の文字数 (セクションを区切りで連結したときの長さ)
export const BOARD_MAX_LENGTH = 20_000;
// 板のセクション数
export const BOARD_MAX_SECTIONS = 1_000;

/** 板全体の文字数 (セクションを区切りで連結したときの長さ)。BOARD_MAX_LENGTH と比べる */
export function boardLength(sections: { content: string }[]): number {
  return (
    sections.reduce((n, s) => n + s.content.length, 0) +
    Math.max(0, sections.length - 1) * SECTION_SEPARATOR.length
  );
}

/** 作成日時から有効期限を計算する */
export function memoExpiresAt(createdAt: Date = new Date()): Date {
  return new Date(createdAt.getTime() + MEMO_TTL_MS);
}
