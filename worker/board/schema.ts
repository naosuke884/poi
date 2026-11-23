import { memoExpiresAt, type TagIcon } from "@shared/constants";
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "../auth/schema";

// auth/schema.ts は Better Auth CLI (npm run auth:schema) が上書きするため、
// アプリ独自のテーブルはこのファイルに定義する。
//
// 1 行 = 板 (ユーザーごとに 1 枚) の 1 セクション。
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
    // 1 セクション分のテキスト (改行や空行を含んでよい。空でも 1 セクション)
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
    // 作成時に createdAt + 保持日数 (MEMO_TTL_DAYS) で確定させ、内容や並びの更新では延ばさない
    expiresAt: integer("expires_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => memoExpiresAt()),
    // セクションに付けたタグ (tag.id。1 つまで。付けていなければ null)。
    // 名前ではなく id で持つ: 名前を変えてもセクションの行は変わらないので、開いたままの別の画面の保存と食い違わない。
    // 外部キー (ON DELETE SET NULL) にしないのは、タグの登録を消すときに付けていた行から外す (routes.ts の
    // DELETE /api/tags) のと、保存では登録に無い id を書かない (PUT /api/board) のとで足り、外すことを
    // スキーマの暗黙の動きにせずルートに書いておくため。
    // 列は末尾に足す: PUT /api/board の insert ... select は列をこの定義の順に並べる (routes.ts)
    tagId: text("tag_id"),
  },
  (table) => [
    index("memo_userId_expiresAt_idx").on(table.userId, table.expiresAt),
    index("memo_expiresAt_idx").on(table.expiresAt),
  ],
);

// 登録済みのタグ (1 行 = 1 ユーザーの 1 タグ)。セクションに付けるタグはここから選ぶ。
// セクション (memo) と別に持つのは、付けたセクションが期限で消えても、登録したタグは選べるまま残すため
export const tag = sqliteTable(
  "tag",
  {
    // セクション (memo.tag_id) から指す。名前を変えても変わらない
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // 名前はユーザーの中で重ならない (下の一意のインデックス)
    name: text("name").notNull(),
    // アイコン (shared/constants.ts の TAG_ICONS のどれか)。名前から選ぶので、名前を変えたら選び直す
    icon: text("icon").$type<TagIcon>().notNull().default("other"),
    // 一覧は登録した順に並べる
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [uniqueIndex("tag_userId_name_idx").on(table.userId, table.name)],
);

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
