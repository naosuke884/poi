// セクションの保持期間 (日数)。ユーザーごとに user_setting.memo_ttl_days で変えられ、
// 設定していなければ MEMO_TTL_DAYS (30 日)。「1 ヶ月」は 30 日固定とし、暦月は扱わない。
// UI 側 (src/) からもこのファイルを参照して既定値や選択肢を表示する。
export const MEMO_TTL_DAYS = 30;
// 設定で選べる日数。API (worker/app/routes.ts のバリデーション) と UI (設定モーダルの選択肢) で共有する
export const MEMO_TTL_CHOICES = [1, 3, 7, 14, 30, 60, 90] as const;

export const DAY_MS = 24 * 60 * 60 * 1000;

// セクションの区切り (= 改行 3 つ = 空行 2 つ)。空行 1 つはセクションの中に含めてよい。
// UI はエディタにこれが入力されたらそこでセクションを分け、API はセクションの内容にこれが含まれないことを検証する
export const SECTION_SEPARATOR = "\n\n\n";

// バリデーション上限。API (worker/app/routes.ts) と UI (文字数カウンタ / 保存前チェック) で共有する
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

/** 作成日時と保持日数から有効期限を計算する */
export function memoExpiresAt(createdAt: Date = new Date(), ttlDays: number = MEMO_TTL_DAYS): Date {
  return new Date(createdAt.getTime() + ttlDays * DAY_MS);
}
