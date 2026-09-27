import { memoExpiresAt } from "@shared/constants";

/**
 * 保存期間を ttlDays 日に変えたとき、その場で期限を過ぎて消えるセクションの数。
 * サーバは保存時に全セクションの期限を「作成日 + 日数」に引き直し、期限を過ぎたものは見せなくなる
 * (worker/board/routes.ts の PUT /api/settings) ので、同じ計算で数える
 */
export function countExpiring(
  createdAts: readonly (string | Date)[],
  ttlDays: number,
  now = new Date(),
): number {
  return createdAts.filter((c) => memoExpiresAt(new Date(c), ttlDays) <= now).length;
}
