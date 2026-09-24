import { MEMO_TTL_DAYS, memoExpiresAt } from "@shared/constants";
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "../auth/schema";

// auth/schema.ts は Better Auth CLI (npm run auth:schema) が上書きするため、
// アプリ独自のテーブルはこのファイルに定義する。
//
// 1 行 = 板 (ユーザーごとに 1 枚のテキスト) の 1 セクション (空行 2 つで区切られたまとまり)。
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
    // 1 セクション分のテキスト (改行や空行 1 つは含んでよいが、区切りの "\n\n\n" (空行 2 つ) は含まない。空でも 1 セクション)
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
    // 作成時に createdAt + 保持日数 (user_setting.memo_ttl_days。無ければ 30 日) で確定させ、
    // 内容や並びの更新では延ばさない。保持日数の設定を変えたときだけ、全セクションを
    // createdAt + 新しい日数で引き直す (PUT /api/settings)
    expiresAt: integer("expires_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => memoExpiresAt()),
  },
  (table) => [
    index("memo_userId_expiresAt_idx").on(table.userId, table.expiresAt),
    index("memo_expiresAt_idx").on(table.expiresAt),
  ],
);

// ユーザーごとの設定 (1 行 = 1 ユーザー)。行が無いユーザーは既定値で動く
export const userSetting = sqliteTable("user_setting", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // セクションを作成から何日で削除するか (MEMO_TTL_CHOICES のいずれか)
  memoTtlDays: integer("memo_ttl_days").notNull().default(MEMO_TTL_DAYS),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

// 板ごとの版 (1 行 = 1 ユーザー)。PUT /api/board のたびに新しい値にし、古い版をもとにした保存を断る
// (別の端末 / タブで保存された板を、それを知らない古い内容で上書きしないため。worker/board/routes.ts)。
// 行が無いのは一度も保存していない板 (版は null として扱う)
export const board = sqliteTable("board", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // 保存ごとに発行する不透明な文字列 (UUID)。連番にしないのは、同時に来た 2 つの保存が
  // 同じ次の版を名乗れないようにするため (自分が書いた版になっているかで、どちらが通ったかを判定する)
  revision: text("revision").notNull(),
});
