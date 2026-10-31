import { DAY_MS } from "@shared/constants";
import { describe, expect } from "vite-plus/test";

import { test } from "../d1-test";
import { createDb } from "../db";
import { sweepExpiredMemos } from "./sweep";

// Cron の後始末をテストごとに立てる空のローカル D1 に対して実行する。
// 期限 (expires_at) と作成日時は行ごとに直接入れ、境界を狙う

const NOW = Date.UTC(2026, 9, 17, 0, 0, 0);
/** 選べる中で最も長い保持日数 */
const MAX_TTL_MS = 90 * DAY_MS;

const it = test.extend("memos", async ({ db }) => {
  for (const id of ["u1", "u2"]) {
    await db
      .prepare("insert into user (id, name, email) values (?, ?, ?)")
      .bind(id, id, `${id}@example.com`)
      .run();
  }
  /** expiresAt の行を、内容を id と同じにして入れる */
  async function insert(
    id: string,
    userId: string,
    expiresAt: number,
    createdAt = expiresAt - 30 * DAY_MS,
  ) {
    await db
      .prepare(
        "insert into memo (id, user_id, content, position, created_at, updated_at, expires_at) values (?, ?, ?, 0, ?, ?, ?)",
      )
      .bind(id, userId, id, createdAt, createdAt, expiresAt)
      .run();
  }
  /** 残っている行の id と内容 */
  async function rows() {
    const { results } = await db
      .prepare("select id, content from memo order by id")
      .all<{ id: string; content: string }>();
    return results;
  }
  return { insert, rows };
});

const sweep = (db: D1Database, batchSize?: number) =>
  sweepExpiredMemos(createDb(db), new Date(NOW), batchSize);

describe.concurrent("sweepExpiredMemos", () => {
  it("期限を過ぎた行と期限ちょうどの行は、中身を消して行を残し、中身を消した件数を返す", async ({
    db,
    memos,
  }) => {
    await memos.insert("past", "u1", NOW - 1);
    await memos.insert("exact", "u1", NOW);
    await memos.insert("future", "u1", NOW + 1);
    expect(await sweep(db)).toEqual({ cleared: 2, deleted: 0 });
    expect(await memos.rows()).toEqual([
      { id: "exact", content: "" },
      { id: "future", content: "future" },
      { id: "past", content: "" },
    ]);
  });

  it("期限前の行は、どのユーザーのものでも触らない", async ({ db, memos }) => {
    await memos.insert("u1-expired", "u1", NOW - DAY_MS);
    await memos.insert("u1-alive", "u1", NOW + DAY_MS);
    await memos.insert("u2-alive", "u2", NOW + DAY_MS);
    await memos.insert("u2-expired", "u2", NOW - DAY_MS);
    expect(await sweep(db)).toEqual({ cleared: 2, deleted: 0 });
    expect(await memos.rows()).toEqual([
      { id: "u1-alive", content: "u1-alive" },
      { id: "u1-expired", content: "" },
      { id: "u2-alive", content: "u2-alive" },
      { id: "u2-expired", content: "" },
    ]);
  });

  it("中身を消した行は、次の実行では数えない", async ({ db, memos }) => {
    await memos.insert("expired", "u1", NOW - DAY_MS);
    await sweep(db);
    expect(await sweep(db)).toEqual({ cleared: 0, deleted: 0 });
  });

  it("期限切れの行のうち、作成日時が選べる最長の保持日数 (90 日) より前のものは削除し、削除した件数を返す", async ({
    db,
    memos,
  }) => {
    await memos.insert("old", "u1", NOW - DAY_MS, NOW - MAX_TTL_MS);
    await memos.insert("recent", "u1", NOW - DAY_MS, NOW - MAX_TTL_MS + 1);
    expect(await sweep(db)).toEqual({ cleared: 2, deleted: 1 });
    expect(await memos.rows()).toEqual([{ id: "recent", content: "" }]);
  });

  it("期限切れが無ければ何もせず 0 件を返す", async ({ db, memos }) => {
    await memos.insert("alive", "u1", NOW + DAY_MS);
    expect(await sweep(db)).toEqual({ cleared: 0, deleted: 0 });
    expect(await memos.rows()).toEqual([{ id: "alive", content: "alive" }]);
  });

  it("1 文で処理する件数を超えて溜まっていても、小分けにして全部処理する", async ({
    db,
    memos,
  }) => {
    for (let i = 0; i < 5; i++) await memos.insert(`expired-${i}`, "u1", NOW - i);
    for (let i = 0; i < 5; i++) await memos.insert(`old-${i}`, "u1", NOW - i, NOW - MAX_TTL_MS - i);
    await memos.insert("alive", "u1", NOW + 1);
    expect(await sweep(db, 2)).toEqual({ cleared: 10, deleted: 5 });
    expect((await memos.rows()).map((row) => row.id)).toEqual([
      "alive",
      ...[0, 1, 2, 3, 4].map((i) => `expired-${i}`),
    ]);
  });
});
