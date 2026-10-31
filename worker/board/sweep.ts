import { DAY_MS, MEMO_TTL_CHOICES } from "@shared/constants";
import { and, inArray, lte, ne } from "drizzle-orm";

import type { Db } from "../db";
import { memo } from "./schema";

// 期限切れのセクション (memo テーブルの 1 行 = 板の 1 セクション) の後始末。
// API 側は expiresAt > now のフィルタで期限切れを即時に見えなくしているが (routes.ts の visibleSections)、
// それだけでは DB に残り続けるため、Cron Trigger (wrangler.jsonc の triggers.crons) から
// 定期的にこの関数を呼んで「1 ヶ月で必ず消える」を保証する。
// scheduled ハンドラから切り離しておくことで、単体テストや他の経路からも再利用できる。
//
// 期限切れの行はすぐには消さず、中身 (content) だけ消して行を残す。行ごと消すと、その id を古いタブが送り返したとき、
// 保持日数を延ばした後なら PUT /api/board の createdAt の判定を通って作り直されてしまうため (HAY-60)。
// 残した行は、createdAt がどの保持日数でも期限切れになるところまで古くなったら (createdAt の判定だけで弾ける) 消す

/**
 * 1 文で書き換える・消す行数の上限。溜まった期限切れを 1 つの文で処理すると、D1 の 1 文あたりの実行時間の上限に当たって
 * 全部ロールバックされうる (次の Cron ではさらに溜まっているので、また失敗する)。
 * UPDATE / DELETE ... LIMIT は SQLite のコンパイル時オプション (SQLITE_ENABLE_UPDATE_DELETE_LIMIT) 次第で使えるとは
 * 限らないので、id の subquery で区切る
 */
const SWEEP_BATCH_SIZE = 1_000;

/** 選べる中で最も長い保持日数。createdAt がこれより古い id は、どの設定でも PUT /api/board で作り直されない */
const MAX_TTL_MS = Math.max(...MEMO_TTL_CHOICES) * DAY_MS;

/**
 * `expiresAt <= now` のセクションの中身を消し、そのうち createdAt が選べる最長の保持日数より古い行は削除する。
 * 中身を消した件数と、削除した件数を返す
 */
export async function sweepExpiredMemos(
  db: Db,
  now: Date = new Date(),
  batchSize: number = SWEEP_BATCH_SIZE,
): Promise<{ cleared: number; deleted: number }> {
  const expired = lte(memo.expiresAt, now);
  // Drizzle の D1 ドライバでは .run() が D1Result を返し、書き換え・削除した行数は meta.changes に入る
  const cleared = await inBatches(batchSize, (limit) =>
    db
      .update(memo)
      .set({ content: "" })
      .where(
        inArray(
          memo.id,
          db
            .select({ id: memo.id })
            .from(memo)
            .where(and(expired, ne(memo.content, "")))
            .limit(limit),
        ),
      )
      .run(),
  );
  const deleted = await inBatches(batchSize, (limit) =>
    db
      .delete(memo)
      .where(
        inArray(
          memo.id,
          db
            .select({ id: memo.id })
            .from(memo)
            .where(and(expired, lte(memo.createdAt, new Date(now.getTime() - MAX_TTL_MS))))
            .limit(limit),
        ),
      )
      .run(),
  );
  return { cleared, deleted };
}

/** 1 回 batchSize 行までの文を、対象が尽きるまで繰り返し、変わった行数の合計を返す */
async function inBatches(
  batchSize: number,
  run: (limit: number) => Promise<{ meta: { changes: number } }>,
): Promise<number> {
  let total = 0;
  for (;;) {
    const { changes } = (await run(batchSize)).meta;
    total += changes;
    if (changes < batchSize) return total;
  }
}
