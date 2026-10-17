import { BOARD_MAX_SECTIONS, DAY_MS } from "@shared/constants";
import { Hono } from "hono";
import { describe, expect } from "vite-plus/test";

import { test } from "../d1-test";
import type { AppEnv } from "../types";
import { boardRoutes, settingsRoutes } from "./routes";

// PUT /api/board をテストごとに立てる空のローカル D1 に対して実行する。
// ログインはセッションを引かずに固定のユーザーを入れて済ませる

type Section = { id: string; content: string; position: number; createdAt: string };

const USER_ID = "u1";

const app = new Hono<AppEnv>()
  .use(async (c, next) => {
    c.set("user", { id: USER_ID } as NonNullable<AppEnv["Variables"]["user"]>);
    c.set("session", {} as NonNullable<AppEnv["Variables"]["session"]>);
    await next();
  })
  .route("/", boardRoutes)
  .route("/settings", settingsRoutes);

type DraftSection = { id: string | null; content: string; createdAt?: string };
type PutResponse = { sections: Section[]; revision: string; error?: string };

/** USER_ID の板を db に対して読み書きする */
function boardClient(db: D1Database) {
  // 直前の保存で返ってきた版 (put はそれを付けて送り、成功すれば更新する。1 つの端末で保存し続けるのと同じ)
  let latestRevision: string | null = null;

  /** 版を指定して保存する (別の端末からの保存など) */
  async function putAt(revision: string | null, sections: DraftSection[]) {
    const res = await app.request(
      "/",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: USER_ID, revision, sections }),
      },
      { DB: db },
    );
    return { status: res.status, body: (await res.json()) as PutResponse };
  }

  async function put(sections: DraftSection[]) {
    const res = await putAt(latestRevision, sections);
    if (res.status === 200) latestRevision = res.body.revision;
    return res;
  }

  async function get() {
    const res = await app.request("/", {}, { DB: db });
    return (await res.json()) as { sections: Section[]; revision: string | null };
  }

  async function rows() {
    const { results } = await db
      .prepare("select id, content, position from memo where user_id = ? order by position")
      .bind(USER_ID)
      .all<{ id: string; content: string; position: number }>();
    return results;
  }

  return { putAt, put, get, rows };
}

const it = test.extend("board", async ({ db }) => {
  await db
    .prepare("insert into user (id, name, email) values (?, ?, ?)")
    .bind(USER_ID, "u", "u@example.com")
    .run();
  return boardClient(db);
});

describe.concurrent("PUT /api/board", () => {
  // 既定の 5 秒では CI で落ちる: 1000 行を 3 回書き込むうえ、時間には D1 を立てる分も入り、同じファイルの他のテストと
  // 並列で D1 を立てて CPU を取り合う。ローカルでは 2 秒ほどだが、GitHub Actions のランナーでは 4〜5 秒かかり時々超えていた
  it(
    "セクションが上限の数あっても、全部作る・全部並べ替える・全部消すが通る",
    { timeout: 20_000 },
    async ({ board }) => {
      const contents = Array.from({ length: BOARD_MAX_SECTIONS }, (_, i) => `s${i}`);
      const created = await board.put(contents.map((content) => ({ id: null, content })));
      expect(created.status).toBe(200);
      expect(created.body.sections.map((s) => s.content)).toEqual(contents);

      // 逆順にする (全行の position が変わる) + 一部の内容を変える
      const reversed = created.body.sections
        .toReversed()
        .map((s, i) => ({ id: s.id, content: i % 2 ? s.content : `${s.content}!` }));
      const moved = await board.put(reversed);
      expect(moved.status).toBe(200);
      expect(moved.body.sections.map((s) => s.id)).toEqual(reversed.map((s) => s.id));
      expect(await board.rows()).toEqual(reversed.map((s, position) => ({ ...s, position })));

      const cleared = await board.put([]);
      expect(cleared.status).toBe(200);
      expect(await board.rows()).toEqual([]);
    },
  );

  it("更新・作成・削除を 1 回の保存で混ぜられ、作成日は引き継ぐ", async ({ board }) => {
    const first = await board.put([
      { id: null, content: "a" },
      { id: null, content: "b" },
      { id: null, content: "c" },
    ]);
    const [a, b, c] = first.body.sections;
    const second = await board.put([
      { id: c.id, content: "c" },
      { id: null, content: "new" },
      { id: a.id, content: "a2" },
    ]);
    expect(second.status).toBe(200);
    const [c2, added, a2] = second.body.sections;
    expect([c2.id, a2.id]).toEqual([c.id, a.id]);
    expect([c2.createdAt, a2.createdAt]).toEqual([c.createdAt, a.createdAt]);
    expect(await board.rows()).toEqual([
      { id: c.id, content: "c", position: 0 },
      { id: added.id, content: "new", position: 1 },
      { id: a.id, content: "a2", position: 2 },
    ]);
    expect((await board.rows()).some((row) => row.id === b.id)).toBe(false);
  });

  it("知らない id で、今の保持日数ではもう期限切れのものは作り直さない (issue #94)", async ({
    db,
    board,
  }) => {
    // 別のタブで保持日数を 7 日に短くし、10 日前に作ったセクションが消えた後の保存
    await db
      .prepare("insert into user_setting (user_id, memo_ttl_days) values (?, ?)")
      .bind(USER_ID, 7)
      .run();
    const now = Date.now();
    const first = await board.put([{ id: null, content: "kept" }]);
    const [kept] = first.body.sections;
    const saved = await board.put([
      { id: "gone", content: "old", createdAt: new Date(now - 10 * DAY_MS).toISOString() },
      { id: kept.id, content: "kept2", createdAt: kept.createdAt },
      { id: "deleted", content: "recent", createdAt: new Date(now - DAY_MS).toISOString() },
    ]);
    expect(saved.status).toBe(200);
    const [gone, kept2, recent] = saved.body.sections;
    expect(gone).toBeNull();
    expect(kept2).toMatchObject({ id: kept.id, content: "kept2" });
    expect(recent).toMatchObject({ content: "recent" });
    expect(await board.rows()).toEqual([
      { id: kept.id, content: "kept2", position: 0 },
      { id: recent.id, content: "recent", position: 1 },
    ]);
  });

  it("JSON 経由でも内容をそのまま保存する", async ({ board }) => {
    const content = `"引用" \\ バックスラッシュ\tタブ\n改行 😀 {"id":"x"} ' --`;
    const created = await board.put([{ id: null, content }]);
    expect(created.body.sections[0].content).toBe(content);
    const updated = await board.put([{ id: created.body.sections[0].id, content: `${content}!` }]);
    expect(updated.body.sections[0].content).toBe(`${content}!`);
  });

  it("取得した版が返り、保存のたびに変わる", async ({ board }) => {
    expect((await board.get()).revision).toBeNull();
    const first = await board.put([{ id: null, content: "a" }]);
    expect((await board.get()).revision).toBe(first.body.revision);
    const second = await board.put([{ id: first.body.sections[0].id, content: "a2" }]);
    expect(second.body.revision).not.toBe(first.body.revision);
    expect((await board.get()).revision).toBe(second.body.revision);
  });

  it("古い版をもとにした保存は断り、別の場所で保存した内容を残す (issue #72)", async ({
    board,
  }) => {
    // 端末 1 と端末 2 が同じ板 (a) を開き、端末 1 がセクションを足して保存する
    const opened = await board.put([{ id: null, content: "a" }]);
    const [a] = opened.body.sections;
    const added = await board.put([
      { id: a.id, content: "a" },
      { id: null, content: "from device 1" },
    ]);
    expect(added.status).toBe(200);

    // 端末 2 は足されたセクションを知らないまま a を編集して保存しようとする
    const stale = await board.putAt(opened.body.revision, [
      { id: a.id, content: "a from device 2" },
    ]);
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe("Stale");
    expect(await board.rows()).toEqual([
      { id: a.id, content: "a", position: 0 },
      { id: added.body.sections[1].id, content: "from device 1", position: 1 },
    ]);
    expect((await board.get()).revision).toBe(added.body.revision);
  });

  it("まだ保存されていない板を前提にした保存も、先に誰かが保存していれば断る", async ({
    board,
  }) => {
    await board.put([{ id: null, content: "first" }]);
    const stale = await board.putAt(null, [{ id: null, content: "second" }]);
    expect(stale.status).toBe(409);
    expect((await board.rows()).map((row) => row.content)).toEqual(["first"]);
  });

  it("版を送らない (版の導入前の) クライアントの保存は、確かめずに通して版を進める", async ({
    db,
    board,
  }) => {
    const first = await board.put([{ id: null, content: "a" }]);
    const res = await app.request(
      "/",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: USER_ID, sections: [{ id: null, content: "old client" }] }),
      },
      { DB: db },
    );
    expect(res.status).toBe(200);
    expect((await board.rows()).map((row) => row.content)).toEqual(["old client"]);
    const { revision } = await board.get();
    expect(revision).not.toBeNull();
    expect(revision).not.toBe(first.body.revision);
  });

  it("同じ版をもとにした保存が同時に来たら、片方だけ通る", async ({ board }) => {
    const opened = await board.put([{ id: null, content: "a" }]);
    const [a] = opened.body.sections;
    const results = await Promise.all([
      board.putAt(opened.body.revision, [{ id: a.id, content: "x" }]),
      board.putAt(opened.body.revision, [{ id: a.id, content: "y" }]),
    ]);
    expect(results.map((r) => r.status).toSorted((x, y) => x - y)).toEqual([200, 409]);
    const winner = results.find((r) => r.status === 200)!;
    expect(await board.rows()).toEqual([
      { id: a.id, content: winner.body.sections[0].content, position: 0 },
    ]);
    expect((await board.get()).revision).toBe(winner.body.revision);
  });
});

describe.concurrent("PUT /api/settings", () => {
  /** createdAt に作り、expiresAt を期限とするセクションの行を入れる */
  async function insertSection(db: D1Database, id: string, createdAt: number, expiresAt: number) {
    await db
      .prepare(
        "insert into memo (id, user_id, content, position, created_at, updated_at, expires_at) values (?, ?, ?, 0, ?, ?, ?)",
      )
      .bind(id, USER_ID, id, createdAt, createdAt, expiresAt)
      .run();
  }

  async function putTtlDays(db: D1Database, memoTtlDays: number) {
    return app.request(
      "/settings",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoTtlDays }),
      },
      { DB: db },
    );
  }

  async function expiresAtById(db: D1Database) {
    const { results } = await db
      .prepare("select id, expires_at from memo where user_id = ? order by id")
      .bind(USER_ID)
      .all<{ id: string; expires_at: number }>();
    return Object.fromEntries(results.map((row) => [row.id, row.expires_at]));
  }

  it("保持日数を変えると、見えているセクションの期限を作成日時 + 新しい日数に引き直す", async ({
    db,
    board,
  }) => {
    const now = Date.now();
    await insertSection(db, "a", now - DAY_MS, now + 29 * DAY_MS);
    await insertSection(db, "b", now - 2 * DAY_MS, now + 28 * DAY_MS);

    const res = await putTtlDays(db, 60);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ memoTtlDays: 60 });
    expect(await expiresAtById(db)).toEqual({
      a: now - DAY_MS + 60 * DAY_MS,
      b: now - 2 * DAY_MS + 60 * DAY_MS,
    });
    expect((await board.get()).sections.map((s) => s.id).toSorted()).toEqual(["a", "b"]);
  });

  it("短くすると、新しい期限を過ぎたセクションはすぐ見えなくなる", async ({ db, board }) => {
    const now = Date.now();
    await insertSection(db, "old", now - 10 * DAY_MS, now + 20 * DAY_MS);
    await insertSection(db, "new", now - DAY_MS, now + 29 * DAY_MS);

    expect((await putTtlDays(db, 7)).status).toBe(200);
    expect((await board.get()).sections.map((s) => s.id)).toEqual(["new"]);
  });

  it("延ばしても、期限切れで物理削除待ちのセクションは復活しない", async ({ db, board }) => {
    const now = Date.now();
    // 7 日の設定で 10 日前に作り、もう期限を過ぎて Cron の物理削除を待っている行
    await insertSection(db, "expired", now - 10 * DAY_MS, now - 3 * DAY_MS);

    expect((await putTtlDays(db, 30)).status).toBe(200);
    expect(await expiresAtById(db)).toEqual({ expired: now - 3 * DAY_MS });
    expect((await board.get()).sections).toEqual([]);
  });

  it("保存した保持日数を GET で返し、その後に作るセクションの期限にも使う", async ({
    db,
    board,
  }) => {
    expect((await putTtlDays(db, 3)).status).toBe(200);
    const settings = await app.request("/settings", {}, { DB: db });
    expect(await settings.json()).toEqual({ memoTtlDays: 3 });

    const created = await board.put([{ id: null, content: "a" }]);
    const [a] = created.body.sections as (Section & { expiresAt: string })[];
    expect(new Date(a.expiresAt).getTime() - new Date(a.createdAt).getTime()).toBe(3 * DAY_MS);
  });

  it("板の取得でも、保存した保持日数を ttlDays として返す (未設定なら既定の 30 日)", async ({
    db,
    board,
  }) => {
    const ttlDays = async () => ((await board.get()) as { ttlDays?: number }).ttlDays;
    expect(await ttlDays()).toBe(30);
    expect((await putTtlDays(db, 7)).status).toBe(200);
    expect(await ttlDays()).toBe(7);
  });

  it("選択肢にない日数は 400 で断り、設定を変えない", async ({ db }) => {
    const res = await putTtlDays(db, 5);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Bad Request" });
    const settings = await app.request("/settings", {}, { DB: db });
    expect(await settings.json()).toEqual({ memoTtlDays: 30 });
  });
});
