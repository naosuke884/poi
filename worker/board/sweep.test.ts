import { DAY_MS } from "@shared/constants";
import { describe, expect } from "vite-plus/test";

import { test } from "../d1-test";
import { createDb } from "../db";
import { deleteExpiredMemos } from "./sweep";

// Cron の物理削除をテストごとに立てる空のローカル D1 に対して実行する。
// 期限 (expires_at) は作成日時と関係なく行ごとに直接入れ、境界を狙う

const NOW = Date.UTC(2026, 9, 17, 0, 0, 0);

const it = test.extend("memos", async ({ db }) => {
  for (const id of ["u1", "u2"]) {
    await db
      .prepare("insert into user (id, name, email) values (?, ?, ?)")
      .bind(id, id, `${id}@example.com`)
      .run();
  }
  /** expiresAt の行を入れる */
  async function insert(id: string, userId: string, expiresAt: number) {
    await db
      .prepare(
        "insert into memo (id, user_id, content, position, created_at, updated_at, expires_at) values (?, ?, ?, 0, ?, ?, ?)",
      )
      .bind(id, userId, id, expiresAt - 30 * DAY_MS, expiresAt - 30 * DAY_MS, expiresAt)
      .run();
  }
  async function ids() {
    const { results } = await db.prepare("select id from memo order by id").all<{ id: string }>();
    return results.map((row) => row.id);
  }
  return { insert, ids };
});

describe.concurrent("deleteExpiredMemos", () => {
  it("期限を過ぎた行と期限ちょうどの行を消し、消した件数を返す", async ({ db, memos }) => {
    await memos.insert("past", "u1", NOW - 1);
    await memos.insert("exact", "u1", NOW);
    await memos.insert("future", "u1", NOW + 1);
    expect(await deleteExpiredMemos(createDb(db), new Date(NOW))).toBe(2);
    expect(await memos.ids()).toEqual(["future"]);
  });

  it("期限前の行は、どのユーザーのものでも残す", async ({ db, memos }) => {
    await memos.insert("u1-expired", "u1", NOW - DAY_MS);
    await memos.insert("u1-alive", "u1", NOW + DAY_MS);
    await memos.insert("u2-alive", "u2", NOW + DAY_MS);
    await memos.insert("u2-expired", "u2", NOW - DAY_MS);
    expect(await deleteExpiredMemos(createDb(db), new Date(NOW))).toBe(2);
    expect(await memos.ids()).toEqual(["u1-alive", "u2-alive"]);
  });

  it("期限切れが無ければ何も消さず 0 を返す", async ({ db, memos }) => {
    await memos.insert("alive", "u1", NOW + DAY_MS);
    expect(await deleteExpiredMemos(createDb(db), new Date(NOW))).toBe(0);
    expect(await memos.ids()).toEqual(["alive"]);
  });
});
