import { describe, expect } from "vite-plus/test";

import { test } from "../d1-test";
import { createDb } from "../db";
import { deleteExpiredAuthRecords } from "./sweep";

// 期限切れのセッション / 検証用の値の物理削除をテストごとに立てる空のローカル D1 に対して実行する

const NOW = Date.UTC(2026, 9, 17, 0, 0, 0);

const it = test.extend("auth", async ({ db }) => {
  await db
    .prepare("insert into user (id, name, email) values (?, ?, ?)")
    .bind("u1", "u1", "u1@example.com")
    .run();
  return {
    async insertSession(id: string, expiresAt: number) {
      await db
        .prepare(
          "insert into session (id, token, user_id, expires_at, created_at, updated_at, ip_address, user_agent) values (?, ?, 'u1', ?, ?, ?, '192.0.2.1', 'test')",
        )
        .bind(id, `token-${id}`, expiresAt, NOW, NOW)
        .run();
    },
    async insertVerification(id: string, expiresAt: number) {
      await db
        .prepare(
          "insert into verification (id, identifier, value, expires_at) values (?, ?, 'v', ?)",
        )
        .bind(id, `state-${id}`, expiresAt)
        .run();
    },
    async ids(table: "session" | "verification") {
      const { results } = await db
        .prepare(`select id from ${table} order by id`)
        .all<{ id: string }>();
      return results.map((row) => row.id);
    },
  };
});

describe.concurrent("deleteExpiredAuthRecords", () => {
  it("期限を過ぎたものと期限ちょうどのセッションを消し、期限前のものは残す", async ({
    db,
    auth,
  }) => {
    await auth.insertSession("past", NOW - 1);
    await auth.insertSession("exact", NOW);
    await auth.insertSession("future", NOW + 1);
    expect(await deleteExpiredAuthRecords(createDb(db), new Date(NOW))).toEqual({
      sessions: 2,
      verifications: 0,
    });
    expect(await auth.ids("session")).toEqual(["future"]);
  });

  it("期限を過ぎた検証用の値 (OAuth の state など) も消す", async ({ db, auth }) => {
    await auth.insertVerification("past", NOW - 1);
    await auth.insertVerification("future", NOW + 1);
    expect(await deleteExpiredAuthRecords(createDb(db), new Date(NOW))).toEqual({
      sessions: 0,
      verifications: 1,
    });
    expect(await auth.ids("verification")).toEqual(["future"]);
  });

  it("ユーザーとその板は消さない", async ({ db, auth }) => {
    await auth.insertSession("past", NOW - 1);
    await deleteExpiredAuthRecords(createDb(db), new Date(NOW));
    const row = await db.prepare("select count(*) as n from user").first<{ n: number }>();
    expect(row?.n).toBe(1);
  });
});
