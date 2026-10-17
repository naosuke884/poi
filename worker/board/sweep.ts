import { inArray, lte } from "drizzle-orm";

import type { Db } from "../db";
import { memo } from "./schema";

// 期限切れのセクション (memo テーブルの 1 行 = 板の 1 セクション) の物理削除。
// API 側は expiresAt > now のフィルタで期限切れを即時に見えなくしているが (routes.ts の visibleSections)、
// それだけでは DB に残り続けるため、Cron Trigger (wrangler.jsonc の triggers.crons) から
// 定期的にこの関数を呼んで「1 ヶ月で必ず消える」を保証する。
// scheduled ハンドラから切り離しておくことで、単体テストや他の経路からも再利用できる。

/**
 * 1 文で消す行数の上限。溜まった期限切れを 1 つの DELETE で消すと、D1 の 1 文あたりの実行時間の上限に当たって
 * 全部ロールバックされうる (次の Cron ではさらに溜まっているので、また失敗する)。
 * DELETE ... LIMIT は SQLite のコンパイル時オプション (SQLITE_ENABLE_UPDATE_DELETE_LIMIT) 次第で使えるとは限らないので、
 * id の subquery で区切る
 */
const SWEEP_BATCH_SIZE = 1_000;

/** `expiresAt <= now` のセクション (memo の行) をすべて削除し、削除した件数を返す */
export async function deleteExpiredMemos(
  db: Db,
  now: Date = new Date(),
  batchSize: number = SWEEP_BATCH_SIZE,
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const expired = db
      .select({ id: memo.id })
      .from(memo)
      .where(lte(memo.expiresAt, now))
      .limit(batchSize);
    // Drizzle の D1 ドライバでは .run() が D1Result を返し、削除行数は meta.changes に入る
    const result = await db.delete(memo).where(inArray(memo.id, expired)).run();
    deleted += result.meta.changes;
    if (result.meta.changes < batchSize) return deleted;
  }
}
