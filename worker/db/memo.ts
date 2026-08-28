import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { memoExpiresAt } from "../memo/constants";
import { user } from "./schema";

// schema.ts は Better Auth CLI (npm run auth:schema) が上書きするため、
// アプリ独自のテーブルはこのファイルに定義する。
//
// 1 行 = 板 (ユーザーごとに 1 枚のテキスト) の 1 セクション (空行で区切られたまとまり)。
// 期限切れの削除はセクション単位で行う (書いたセクションから順に消えていく)。
export const memo = sqliteTable(
  "memo",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // 1 セクション分のテキスト (単独の改行は含んでよいが、区切りの空行 "\n\n" は含まない。空でも 1 セクション)
    content: text("content").notNull(),
    // 板の中での並び順 (0 始まり)。PUT /api/board のたびに振り直す
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
    // 作成時に createdAt + 30 日で確定させ、以後は更新しない (延命させない)
    expiresAt: integer("expires_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => memoExpiresAt()),
  },
  (table) => [
    index("memo_userId_expiresAt_idx").on(table.userId, table.expiresAt),
    index("memo_expiresAt_idx").on(table.expiresAt),
  ],
);

export type Memo = typeof memo.$inferSelect;
export type NewMemo = typeof memo.$inferInsert;
