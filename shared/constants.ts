// セクションの保持期間 (日数)。ユーザーごとに user_setting.memo_ttl_days で変えられ、
// 設定していなければ MEMO_TTL_DAYS (30 日)。「1 ヶ月」は 30 日固定とし、暦月は扱わない。
// UI 側 (src/) からもこのファイルを参照して既定値や選択肢を表示する。
export const MEMO_TTL_DAYS = 30;
// 設定で選べる日数。API (worker/board/routes.ts のバリデーション) と UI (設定モーダルの選択肢) で共有する
export const MEMO_TTL_CHOICES = [1, 3, 7, 14, 30, 60, 90] as const;

export const DAY_MS = 24 * 60 * 60 * 1000;

// セクションの区切り (= 改行 3 つ = 空行 2 つ)。空行 1 つはセクションの中に含めてよい。
// UI はエディタにこれが入力されたらそこでセクションを分け、API はセクションの内容にこれが含まれないことを検証する
export const SECTION_SEPARATOR = "\n\n\n";

// バリデーション上限。API (worker/board/routes.ts) と UI (文字数カウンタ / 保存前チェック) で共有する
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

/**
 * 保持日数を previousTtlDays から ttlDays に変えたときの、まだ期限 (expiresAt) の来ていないセクションの新しい期限 (HAY-59)。
 * 候補は、作成日 + 新しい日数がまだ先ならそれ、もう過ぎていれば「変えた時点 (changedAt) + 新しい日数」。
 * 短くしたら候補と今の期限の早い方、延ばしたら遅い方。同じ日数なら変えない。
 * 作成日 + 日数だけにしないのは、短くしたときに過ぎていたセクションがその場で消えて (元に戻せない) しまうため。
 * 短くしたときに候補だけにしないのは、期限の近いセクションが、短くしたのにかえって長く残ってしまうため。
 * 延ばしたときに早い方を取らないのは、間違えて短くしてから戻しても期限が戻らず (30 → 1 → 7 日で残り 1 日のまま)、
 * 短くして引き直したセクションは延ばすとかえって期限が早まる (30 → 7 → 14 日で残り 7 日が 4 日に) ため。
 * 同じ日数で何もしないのは、保存し直すだけで期限が延びたり縮んだりしないようにするため。
 * worker/board/routes.ts の PUT /api/settings は同じ規則を SQL で書いている
 */
export function retimedExpiresAt(
  createdAt: Date,
  expiresAt: Date,
  previousTtlDays: number,
  ttlDays: number,
  changedAt: Date,
): Date {
  if (ttlDays === previousTtlDays) return expiresAt;
  const fromCreated = memoExpiresAt(createdAt, ttlDays);
  const candidate =
    fromCreated.getTime() > changedAt.getTime() ? fromCreated : memoExpiresAt(changedAt, ttlDays);
  const pick = ttlDays < previousTtlDays ? Math.min : Math.max;
  return new Date(pick(candidate.getTime(), expiresAt.getTime()));
}
