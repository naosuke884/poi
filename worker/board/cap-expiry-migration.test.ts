import { readFileSync } from "node:fs";

import { DAY_MS, MEMO_TTL_DAYS, memoExpiresAt } from "@shared/constants";
import { expect } from "vite-plus/test";

import { test } from "../d1-test";

// drizzle/0012_cap_memo_expiry_30_days.sql: 保存期間を 30 日固定にする前に長い期限で作られたセクションの期限を、
// 作成日時 + 30 日で頭打ちにする。フィクスチャの D1 は migration をすべて流した空の状態なので、
// 本番の既存の行に当たる行を入れてから、この migration をもう一度流して結果を見る (何度流しても同じになる UPDATE 1 文)

const MIGRATION = readFileSync("drizzle/0012_cap_memo_expiry_30_days.sql", "utf8");
const NOW = Date.UTC(2026, 10, 22, 0, 0, 0);

const it = test.extend("seed", async ({ db }) => {
  await db
    .prepare("insert into user (id, name, email) values ('u1', 'u1', 'u1@example.com')")
    .run();
  /** 作成日時と期限を直接入れる (内容は id と同じ) */
  async function insert(id: string, createdAt: number, expiresAt: number, content = id) {
    await db
      .prepare(
        "insert into memo (id, user_id, content, position, created_at, updated_at, expires_at) values (?, 'u1', ?, 0, ?, ?, ?)",
      )
      .bind(id, content, createdAt, createdAt, expiresAt)
      .run();
  }
  async function migrate() {
    await db.prepare(MIGRATION).run();
  }
  async function memo(id: string) {
    return db
      .prepare(
        "select content, created_at as createdAt, expires_at as expiresAt from memo where id = ?",
      )
      .bind(id)
      .first<{ content: string; createdAt: number; expiresAt: number }>();
  }
  return { insert, migrate, memo };
});

it("90 日の期限で作られたセクションは、作成日時 + 30 日で頭打ちになる", async ({ seed }) => {
  const createdAt = NOW - 10 * DAY_MS;
  await seed.insert("long", createdAt, createdAt + 90 * DAY_MS);

  await seed.migrate();

  // アプリが新しいセクションに付ける期限 (memoExpiresAt) と同じ値になる
  expect(await seed.memo("long")).toEqual({
    content: "long",
    createdAt,
    expiresAt: memoExpiresAt(new Date(createdAt)).getTime(),
  });
});

it("頭打ちにすると期限を過ぎるセクションは、期限が過去になる (見えなくなり、後始末で消える)", async ({
  seed,
}) => {
  const createdAt = NOW - 45 * DAY_MS;
  await seed.insert("overdue", createdAt, createdAt + 90 * DAY_MS);

  await seed.migrate();

  expect((await seed.memo("overdue"))?.expiresAt).toBe(createdAt + MEMO_TTL_DAYS * DAY_MS);
  expect((await seed.memo("overdue"))!.expiresAt).toBeLessThan(NOW);
});

it("30 日以下の期限のセクションは変わらない", async ({ seed }) => {
  const createdAt = NOW - 3 * DAY_MS;
  await seed.insert("normal", createdAt, createdAt + MEMO_TTL_DAYS * DAY_MS);
  await seed.insert("short", createdAt, createdAt + 7 * DAY_MS);

  await seed.migrate();

  expect((await seed.memo("normal"))?.expiresAt).toBe(createdAt + MEMO_TTL_DAYS * DAY_MS);
  expect((await seed.memo("short"))?.expiresAt).toBe(createdAt + 7 * DAY_MS);
});

it("もう期限を過ぎて中身が消えたセクションは変わらない", async ({ seed }) => {
  const createdAt = NOW - 40 * DAY_MS;
  await seed.insert("expired", createdAt, createdAt + 7 * DAY_MS, "");

  await seed.migrate();
  // 2 回流しても同じ
  await seed.migrate();

  expect(await seed.memo("expired")).toEqual({
    content: "",
    createdAt,
    expiresAt: createdAt + 7 * DAY_MS,
  });
});
