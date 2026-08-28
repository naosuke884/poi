import { lte } from "drizzle-orm";
import type { Db } from "../db";
import { memo } from "../db/memo";

// 期限切れのセクション (memo テーブルの 1 行 = 板の 1 セクション) の物理削除。
// API 側は expiresAt > now のフィルタで期限切れを即時に見えなくしているが (routes.ts の visibleMemo)、
// それだけでは DB に残り続けるため、Cron Trigger (wrangler.jsonc の triggers.crons) から
// 定期的にこの関数を呼んで「1 ヶ月で必ず消える」を保証する。
// scheduled ハンドラから切り離しておくことで、単体テストや他の経路からも再利用できる。

/** `expiresAt <= now` のセクション (memo の行) をすべて削除し、削除した件数を返す */
export async function deleteExpiredMemos(db: Db, now: Date = new Date()): Promise<number> {
  // Drizzle の D1 ドライバでは .run() が D1Result を返し、削除行数は meta.changes に入る
  const result = await db.delete(memo).where(lte(memo.expiresAt, now)).run();
  return result.meta.changes;
}
