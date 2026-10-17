import { lte } from "drizzle-orm";

import type { Db } from "../db";
import { session, verification } from "./schema";

// 期限切れのセッションと検証用の値 (OAuth の state など) の物理削除。Better Auth は期限切れを使わない
// (読んだときに無効として扱う) だけで、行は消さないので、Cron (worker/index.ts の scheduled) から消す。
// セッションには IP アドレスと User-Agent が入るので、使えなくなった後まで残さない

/** `expiresAt <= now` の session と verification の行を削除し、それぞれの削除件数を返す */
export async function deleteExpiredAuthRecords(
  db: Db,
  now: Date = new Date(),
): Promise<{ sessions: number; verifications: number }> {
  const [sessions, verifications] = await db.batch([
    db.delete(session).where(lte(session.expiresAt, now)),
    db.delete(verification).where(lte(verification.expiresAt, now)),
  ]);
  return { sessions: sessions.meta.changes, verifications: verifications.meta.changes };
}
