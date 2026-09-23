import { readdirSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import type { AppEnv } from "../middleware";
import { BOARD_MAX_SECTIONS } from "./constants";
import { boardRoutes } from "./routes";

// PUT /api/board をローカルの D1 (wrangler の getPlatformProxy。workerd の SQLite で、
// 1 文あたりのバインド数 100 などの上限も本番と同じくかかる) に対して実行する。
// ログインはセッションを引かずに固定のユーザーを入れて済ませる

type Section = { id: string; content: string; position: number; createdAt: string };

const USER_ID = "u1";
let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
let db: D1Database;

const app = new Hono<AppEnv>()
  .use(async (c, next) => {
    c.set("user", { id: USER_ID } as NonNullable<AppEnv["Variables"]["user"]>);
    c.set("session", {} as NonNullable<AppEnv["Variables"]["session"]>);
    await next();
  })
  .route("/", boardRoutes);

async function put(sections: { id: string | null; content: string }[]) {
  const res = await app.request(
    "/",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: USER_ID, sections }),
    },
    { DB: db },
  );
  return { status: res.status, body: (await res.json()) as { sections: Section[] } };
}

async function rows() {
  const { results } = await db
    .prepare("select id, content, position from memo where user_id = ? order by position")
    .bind(USER_ID)
    .all<{ id: string; content: string; position: number }>();
  return results;
}

beforeAll(async () => {
  proxy = await getPlatformProxy<Env>({ persist: false });
  db = proxy.env.DB;
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const statements = readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint");
    await db.batch(statements.map((s) => db.prepare(s)));
  }
}, 60_000);

afterAll(async () => {
  await proxy?.dispose();
});

beforeEach(async () => {
  await db.batch([
    db.prepare("delete from user"),
    db
      .prepare("insert into user (id, name, email) values (?, ?, ?)")
      .bind(USER_ID, "u", "u@example.com"),
  ]);
});

describe("PUT /api/board", () => {
  it("セクションが上限の数あっても、全部作る・全部並べ替える・全部消すが通る", async () => {
    const contents = Array.from({ length: BOARD_MAX_SECTIONS }, (_, i) => `s${i}`);
    const created = await put(contents.map((content) => ({ id: null, content })));
    expect(created.status).toBe(200);
    expect(created.body.sections.map((s) => s.content)).toEqual(contents);

    // 逆順にする (全行の position が変わる) + 一部の内容を変える
    const reversed = created.body.sections
      .toReversed()
      .map((s, i) => ({ id: s.id, content: i % 2 ? s.content : `${s.content}!` }));
    const moved = await put(reversed);
    expect(moved.status).toBe(200);
    expect(moved.body.sections.map((s) => s.id)).toEqual(reversed.map((s) => s.id));
    expect(await rows()).toEqual(reversed.map((s, position) => ({ ...s, position })));

    const cleared = await put([]);
    expect(cleared.status).toBe(200);
    expect(await rows()).toEqual([]);
  });

  it("更新・作成・削除を 1 回の保存で混ぜられ、作成日は引き継ぐ", async () => {
    const first = await put([
      { id: null, content: "a" },
      { id: null, content: "b" },
      { id: null, content: "c" },
    ]);
    const [a, b, c] = first.body.sections;
    const second = await put([
      { id: c.id, content: "c" },
      { id: null, content: "new" },
      { id: a.id, content: "a2" },
    ]);
    expect(second.status).toBe(200);
    const [c2, added, a2] = second.body.sections;
    expect([c2.id, a2.id]).toEqual([c.id, a.id]);
    expect([c2.createdAt, a2.createdAt]).toEqual([c.createdAt, a.createdAt]);
    expect(await rows()).toEqual([
      { id: c.id, content: "c", position: 0 },
      { id: added.id, content: "new", position: 1 },
      { id: a.id, content: "a2", position: 2 },
    ]);
    expect((await rows()).some((row) => row.id === b.id)).toBe(false);
  });

  it("JSON 経由でも内容をそのまま保存する", async () => {
    const content = `"引用" \\ バックスラッシュ\tタブ\n改行 😀 {"id":"x"} ' --`;
    const created = await put([{ id: null, content }]);
    expect(created.body.sections[0].content).toBe(content);
    const updated = await put([{ id: created.body.sections[0].id, content: `${content}!` }]);
    expect(updated.body.sections[0].content).toBe(`${content}!`);
  });
});
