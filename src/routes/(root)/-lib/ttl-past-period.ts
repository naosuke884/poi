import { memoExpiresAt } from "@shared/constants";

/**
 * 保存期間を ttlDays 日に変えたとき、書いてからもう ttlDays 日を過ぎているセクションの数。
 * これらは消えずに、今の期限と「今 + ttlDays 日」の早い方が新しい期限になる (worker/board/routes.ts の
 * PUT /api/settings。規則は retimedExpiresAt)。retimedExpiresAt で「作成日 + 日数」をそのまま使わない側と同じ判定
 */
export function countPastPeriod(
  createdAts: readonly (string | Date)[],
  ttlDays: number,
  now = new Date(),
): number {
  return createdAts.filter((c) => memoExpiresAt(new Date(c), ttlDays).getTime() <= now.getTime())
    .length;
}
