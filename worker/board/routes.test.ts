import {
  BOARD_MAX_SECTIONS,
  DAY_MS,
  TAG_ICON_FALLBACK,
  TAG_MAX_REGISTERED,
} from "@shared/constants";
import { Hono } from "hono";
import { describe, expect, vi } from "vite-plus/test";

import { test } from "../d1-test";
import { createDb } from "../db";
import type { AppEnv } from "../types";
import { boardRoutes, tagRoutes } from "./routes";
import { sweepExpiredMemos } from "./sweep";

// PUT /api/board をテストごとに立てる空のローカル D1 に対して実行する。
// ログインはセッションを引かずに固定のユーザーを入れて済ませる

type Section = {
  id: string;
  content: string;
  position: number;
  createdAt: string;
  tagId: string | null;
};

/** 登録済みのタグ (/api/tags と GET の tags の 1 つ) */
type Tag = { id: string; name: string; icon: string };

const USER_ID = "u1";
/** 他人の行に触れないことを確かめるための、もう 1 人のユーザー */
const OTHER_USER_ID = "u2";

/** userId でログインしている状態のアプリ */
function appAs(userId: string) {
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set("user", { id: userId } as NonNullable<AppEnv["Variables"]["user"]>);
      c.set("session", {} as NonNullable<AppEnv["Variables"]["session"]>);
      await next();
    })
    .route("/", boardRoutes)
    .route("/tags", tagRoutes);
}

const app = appAs(USER_ID);

type DraftSection = {
  id: string | null;
  content: string;
  createdAt?: string;
  tagId?: string | null;
};
type PutResponse = { sections: Section[]; revision: string; error?: string };

/** userId の板を、userId でログインした状態で db に対して読み書きする */
function boardClient(db: D1Database, userId: string) {
  const app = appAs(userId);
  // 直前の保存で返ってきた版 (put はそれを付けて送り、成功すれば更新する。1 つの端末で保存し続けるのと同じ)
  let latestRevision: string | null = null;

  /** 版を指定して保存する (別の端末からの保存など) */
  async function putAt(revision: string | null, sections: DraftSection[]) {
    const res = await app.request(
      "/",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, revision, sections }),
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
    return (await res.json()) as {
      userId: string;
      sections: Section[];
      revision: string | null;
      tags: Tag[];
    };
  }

  async function rows() {
    const { results } = await db
      .prepare("select id, content, position from memo where user_id = ? order by position")
      .bind(userId)
      .all<{ id: string; content: string; position: number }>();
    return results;
  }

  // タグの操作に渡す Env。TYPESAFE_API_KEY を入れると、アイコンを Jev に問い合わせる (fetch を差し替えて使う)
  const tagEnv: { DB: D1Database; TYPESAFE_API_KEY?: string } = { DB: db };
  /** 登録済みのタグの操作 (/api/tags)。返事の本文は変えた後の一覧か、断った理由 */
  async function tagRequest(method: "GET" | "POST" | "DELETE" | "PATCH", body?: object) {
    const res = await app.request(
      "/tags",
      body === undefined
        ? { method }
        : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      tagEnv,
    );
    return { status: res.status, body: (await res.json()) as { tags?: Tag[]; error?: string } };
  }
  const tags = {
    add: (name: string) => tagRequest("POST", { name }),
    remove: (id: string) => tagRequest("DELETE", { id }),
    rename: (id: string, name: string) => tagRequest("PATCH", { id, name }),
    list: async () => (await tagRequest("GET")).body.tags!,
    /** 登録済みのタグの名前 (登録した順) */
    names: async () => (await tags.list()).map((t) => t.name),
    /** 名前 name のタグを登録して、その id を返す */
    addId: async (name: string) =>
      (await tags.add(name)).body.tags!.find((t) => t.name === name)!.id,
  };

  return { putAt, put, get, rows, tags, tagEnv };
}

async function insertUser(db: D1Database, userId: string) {
  await db
    .prepare("insert into user (id, name, email) values (?, ?, ?)")
    .bind(userId, userId, `${userId}@example.com`)
    .run();
}

/**
 * 上限までのタグを D1 に 1 回でまとめて入れる。1 つずつ POST すると上限の数だけ往復し、CI では既定の 5 秒に
 * 届きかけて時々落ちていた。名前は t0, t1, … で、この順に一覧に並ぶ
 */
async function seedTagsToLimit(db: D1Database) {
  await db.batch(
    Array.from({ length: TAG_MAX_REGISTERED }, (_, i) =>
      db
        .prepare("insert into tag (id, user_id, name, created_at) values (?, ?, ?, ?)")
        .bind(`seed-${i}`, USER_ID, `t${i}`, i),
    ),
  );
}

const it = test
  .extend("board", async ({ db }) => {
    await insertUser(db, USER_ID);
    return boardClient(db, USER_ID);
  })
  .extend("otherBoard", async ({ db }) => {
    await insertUser(db, OTHER_USER_ID);
    return boardClient(db, OTHER_USER_ID);
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

  it("知らない id で、作成から保持日数を過ぎているものは作り直さない (issue #94)", async ({
    board,
  }) => {
    // 31 日前に作ったセクションが期限を過ぎて消えた後に、それを知らないタブが保存する
    const now = Date.now();
    const first = await board.put([{ id: null, content: "kept" }]);
    const [kept] = first.body.sections;
    const saved = await board.put([
      { id: "gone", content: "old", createdAt: new Date(now - 31 * DAY_MS).toISOString() },
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

  it("空行をいくつ続けた内容も、1 つのセクションとして保存する", async ({ board }) => {
    const content = "a\n\n\n\nb\n\n\n";
    const res = await board.put([{ id: null, content }]);
    expect(res.body.sections.map((s: { content: string }) => s.content)).toEqual([content]);
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

  it("版を送らない (版の導入前の) クライアントの保存は 400 で断り、板も版も変えない", async ({
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
    expect(res.status).toBe(400);
    expect((await board.rows()).map((row) => row.content)).toEqual(["a"]);
    expect((await board.get()).revision).toBe(first.body.revision);
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

describe.concurrent("他のユーザーの板", () => {
  it("取得で返すのは自分のセクションと自分の版だけ", async ({ board, otherBoard }) => {
    const mine = await board.put([{ id: null, content: "mine" }]);
    await otherBoard.put([{ id: null, content: "theirs" }]);

    const got = await board.get();
    expect(got.userId).toBe(USER_ID);
    expect(got.sections.map((s) => s.content)).toEqual(["mine"]);
    expect(got.revision).toBe(mine.body.revision);
  });

  it("他人のセクションの id を付けて保存しても、他人の行は書き換わらず、自分の板に新しく作る", async ({
    board,
    otherBoard,
  }) => {
    const theirs = await otherBoard.put([
      { id: null, content: "a" },
      { id: null, content: "b" },
    ]);
    const [a, b] = theirs.body.sections;

    const saved = await board.put([
      { id: a.id, content: "hijacked", createdAt: a.createdAt },
      { id: b.id, content: "b", createdAt: b.createdAt },
    ]);
    expect(saved.status).toBe(200);
    const ids = saved.body.sections.map((s) => s.id);
    expect(ids).not.toContain(a.id);
    expect(ids).not.toContain(b.id);
    expect(await board.rows()).toEqual([
      { id: ids[0], content: "hijacked", position: 0 },
      { id: ids[1], content: "b", position: 1 },
    ]);
    expect(await otherBoard.rows()).toEqual([
      { id: a.id, content: "a", position: 0 },
      { id: b.id, content: "b", position: 1 },
    ]);
    expect((await otherBoard.get()).revision).toBe(theirs.body.revision);
  });

  it("自分の板を空にして保存しても、他人の行は消えない", async ({ board, otherBoard }) => {
    await board.put([{ id: null, content: "mine" }]);
    const theirs = await otherBoard.put([{ id: null, content: "theirs" }]);

    expect((await board.put([])).status).toBe(200);
    expect(await board.rows()).toEqual([]);
    expect(await otherBoard.rows()).toEqual([
      { id: theirs.body.sections[0].id, content: "theirs", position: 0 },
    ]);
  });

  it("他人の板の版をもとにした保存は、自分の板の版と違うので断る", async ({
    board,
    otherBoard,
  }) => {
    await board.put([{ id: null, content: "mine" }]);
    const theirs = await otherBoard.put([{ id: null, content: "theirs" }]);

    const stale = await board.putAt(theirs.body.revision, [{ id: null, content: "x" }]);
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe("Stale");
    expect((await board.rows()).map((row) => row.content)).toEqual(["mine"]);
    expect((await otherBoard.get()).revision).toBe(theirs.body.revision);
  });

  it("切り替え前のアカウントの下書きが届いたら 409 UserMismatch で断り、どちらの板も変えない", async ({
    db,
    board,
    otherBoard,
  }) => {
    const mine = await board.put([{ id: null, content: "mine" }]);
    const theirs = await otherBoard.put([{ id: null, content: "theirs" }]);

    // OTHER_USER_ID の板を開いたままのタブが、USER_ID に切り替わった後の cookie で自動保存する。
    // 版は USER_ID の板の今の版にする。他人の版だと UserMismatch の確認が無くても Stale で断られ、板が変わらないので見分けられない
    const res = await app.request(
      "/",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: OTHER_USER_ID,
          revision: mine.body.revision,
          sections: [{ id: theirs.body.sections[0].id, content: "draft of the other account" }],
        }),
      },
      { DB: db },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "UserMismatch" });
    expect((await board.rows()).map((row) => row.content)).toEqual(["mine"]);
    expect((await board.get()).revision).toBe(mine.body.revision);
    expect((await otherBoard.rows()).map((row) => row.content)).toEqual(["theirs"]);
    expect((await otherBoard.get()).revision).toBe(theirs.body.revision);
  });
});

describe.concurrent("タグ", () => {
  it("登録したタグを、登録した順の一覧 (id・名前・アイコン) で返し、板の取得でも返す", async ({
    board,
  }) => {
    const first = await board.tags.add("買い物");
    expect(first.body.tags).toEqual([
      { id: expect.any(String), name: "買い物", icon: TAG_ICON_FALLBACK },
    ]);
    await board.tags.add('it\'s "quoted"');
    expect(await board.tags.names()).toEqual(["買い物", 'it\'s "quoted"']);
    expect((await board.get()).tags).toEqual(await board.tags.list());
  });

  // fetch を差し替える (vi.stubGlobal) テストどうしを並行に走らせると、先に終わった方が差し替えを戻し (unstubAllGlobals)、
  // もう一方が本物の API に問い合わせて落ちる。差し替えるテストはこの中で一つずつ走らせる
  describe("アイコンの問い合わせ", { concurrent: false }, () => {
    /**
     * Jev の代わり (プロセスの外にあるので、ここだけ偽物にする)。タグの名前ごとの答え (無ければ other) を返し、
     * 問い合わせのあったタグの名前を控える。ほかの URL (ローカルの D1 とのやり取り) は本物の fetch に渡す
     */
    function fakeJev(icons: Record<string, string> = {}) {
      const realFetch = globalThis.fetch;
      const asked: string[] = [];
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        if (new Request(input, init).url !== "https://api.typesafe.ai/v1/systemone") {
          return realFetch(input, init);
        }
        const tagName = JSON.parse(init!.body as string).questions.icon.instructions.tag as string;
        asked.push(tagName);
        return Response.json({
          answers: { icon: { type: "choice", choice: icons[tagName] ?? "other", confidence: 1 } },
        });
      });
      return asked;
    }

    it("名前を変えると、id はそのままで、新しい名前でアイコンを選び直す", async ({ board }) => {
      fakeJev({ 買い物: "shopping", 献立: "food" });
      try {
        board.tagEnv.TYPESAFE_API_KEY = "key";
        const id = await board.tags.addId("買い物");
        expect((await board.tags.list())[0]!.icon).toBe("shopping");
        expect((await board.tags.rename(id, "献立")).body.tags).toEqual([
          { id, name: "献立", icon: "food" },
        ]);
        expect((await board.get()).tags).toEqual([{ id, name: "献立", icon: "food" }]);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("登録も名前の変更もできないときは、アイコンを問い合わせずに返す", async ({ board, db }) => {
      await seedTagsToLimit(db);
      const [t0] = await board.tags.list();
      const asked = fakeJev();
      try {
        board.tagEnv.TYPESAFE_API_KEY = "key";
        expect((await board.tags.add("t0")).status).toBe(200);
        expect((await board.tags.add("over")).status).toBe(409);
        expect((await board.tags.rename(t0!.id, "t1")).status).toBe(409);
        expect((await board.tags.rename(t0!.id, "t0")).status).toBe(200);
        expect((await board.tags.rename("無い", "新しい")).status).toBe(404);
        expect(asked).toEqual([]);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  it("登録済みの名前をもう一度登録しても、一覧は変わらない (同じ id のまま)", async ({ board }) => {
    const id = await board.tags.addId("買い物");
    const again = await board.tags.add("買い物");
    expect(again.status).toBe(200);
    expect(again.body.tags).toEqual([{ id, name: "買い物", icon: TAG_ICON_FALLBACK }]);
  });

  it("形の正しくないタグは 400 で断り、登録しない", async ({ board }) => {
    for (const name of ["", " 前後に空白 ", "#先頭に記号", "a".repeat(21)]) {
      expect((await board.tags.add(name)).status).toBe(400);
    }
    expect(await board.tags.list()).toEqual([]);
  });

  it("上限を超える登録は 409 TooManyTags で断る", async ({ board, db }) => {
    await seedTagsToLimit(db);
    expect(await board.tags.list()).toHaveLength(TAG_MAX_REGISTERED);
    const over = await board.tags.add("over");
    expect(over.status).toBe(409);
    expect(over.body).toEqual({ error: "TooManyTags" });
    expect(await board.tags.list()).toHaveLength(TAG_MAX_REGISTERED);
  });

  it("登録済みのタグをセクションに付けて保存し、付け替えや外すだけの保存も反映する", async ({
    board,
  }) => {
    const shopping = await board.tags.addId("買い物");
    const home = await board.tags.addId("家");
    const first = await board.put([
      { id: null, content: "a", tagId: shopping },
      { id: null, content: "b", tagId: null },
    ]);
    expect(first.body.sections.map((s) => s.tagId)).toEqual([shopping, null]);
    const [a, b] = first.body.sections;
    const saved = await board.put([
      { id: a!.id, content: "a", createdAt: a!.createdAt, tagId: home },
      { id: b!.id, content: "b", createdAt: b!.createdAt, tagId: null },
    ]);
    expect(saved.body.sections.map((s) => s.tagId)).toEqual([home, null]);
    const cleared = await board.put([
      { id: a!.id, content: "a", createdAt: a!.createdAt, tagId: null },
      { id: b!.id, content: "b", createdAt: b!.createdAt, tagId: null },
    ]);
    expect(cleared.body.sections.map((s) => s.tagId)).toEqual([null, null]);
    expect((await board.get()).sections.map((s) => s.tagId)).toEqual([null, null]);
  });

  it("登録されていないタグや、他のユーザーのタグを付けて保存しても、タグなしで保存する", async ({
    board,
    otherBoard,
  }) => {
    const theirs = await otherBoard.tags.addId("買い物");
    const saved = await board.put([
      { id: null, content: "a", tagId: "未登録" },
      { id: null, content: "b", tagId: theirs },
    ]);
    expect(saved.status).toBe(200);
    expect(saved.body.sections.map((s) => s.tagId)).toEqual([null, null]);
  });

  it("タグの項目なしで保存しても、今のタグは消えない (タグを知らない古いページの保存)", async ({
    board,
  }) => {
    const x = await board.tags.addId("x");
    const first = await board.put([{ id: null, content: "a", tagId: x }]);
    const [a] = first.body.sections;
    const saved = await board.put([{ id: a!.id, content: "a2", createdAt: a!.createdAt }]);
    expect(saved.body.sections).toMatchObject([{ id: a!.id, content: "a2", tagId: x }]);
  });

  it("登録を消すと、そのタグを付けていたセクションからも外し、本文と他のタグは変えない", async ({
    board,
  }) => {
    const shopping = await board.tags.addId("買い物");
    const home = await board.tags.addId("家");
    await board.put([
      { id: null, content: "a", tagId: shopping },
      { id: null, content: "b", tagId: home },
    ]);
    expect((await board.tags.remove(shopping)).body.tags?.map((t) => t.name)).toEqual(["家"]);
    expect((await board.get()).sections.map((s) => [s.content, s.tagId])).toEqual([
      ["a", null],
      ["b", home],
    ]);
  });

  it("無いタグの登録を消しても、何も変えずに一覧を返す", async ({ board }) => {
    await board.tags.add("家");
    const res = await board.tags.remove("無い");
    expect(res.status).toBe(200);
    expect(res.body.tags?.map((t) => t.name)).toEqual(["家"]);
  });

  it("登録を消しても板の版は進まず、消す前の版をもとにした保存は通り、消したタグは外して保存する", async ({
    board,
  }) => {
    const shopping = await board.tags.addId("買い物");
    const first = await board.put([
      { id: null, content: "a", tagId: shopping },
      { id: null, content: "b", tagId: shopping },
    ]);
    const [a] = first.body.sections;
    await board.tags.remove(shopping);
    expect((await board.get()).revision).toBe(first.body.revision);
    // 別の画面: b を消し、a を書き換えた (消したタグを知らないまま)
    const saved = await board.put([
      { id: a!.id, content: "a2", createdAt: a!.createdAt, tagId: shopping },
    ]);
    expect(saved.status).toBe(200);
    expect(saved.body.sections).toMatchObject([{ id: a!.id, content: "a2", tagId: null }]);
    expect((await board.get()).sections.map((s) => s.content)).toEqual(["a2"]);
  });

  it("保存の確認から書き込みまでの間に登録が消されたタグは、付けずに保存する", async ({
    db,
    board,
  }) => {
    const shopping = await board.tags.addId("買い物");
    // 1 回目の batch (今の板と登録の読み込み) の後、書き込みの batch の前に、別の端末が登録を消す
    let reads = 0;
    const racing = new Proxy(db, {
      get(target, prop) {
        if (prop !== "batch") return Reflect.get(target, prop, target);
        return async (statements: D1PreparedStatement[]) => {
          if (reads++ === 1) await target.prepare("delete from tag").run();
          return target.batch(statements);
        };
      },
    });
    const res = await appAs(USER_ID).request(
      "/",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: USER_ID,
          revision: null,
          sections: [{ id: null, content: "a", tagId: shopping }],
        }),
      },
      { DB: racing },
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as PutResponse).sections).toMatchObject([{ tagId: null }]);
    expect((await board.get()).sections.map((s) => s.tagId)).toEqual([null]);
  });

  it("名前を変えても、一覧は登録した順のままで、セクションは同じタグ (id) を指したまま", async ({
    board,
  }) => {
    const shopping = await board.tags.addId("買い物");
    const home = await board.tags.addId("家");
    await board.put([
      { id: null, content: "a", tagId: shopping },
      { id: null, content: "b", tagId: home },
    ]);
    const renamed = await board.tags.rename(shopping, "買う物");
    expect(renamed.body.tags?.map((t) => [t.id, t.name])).toEqual([
      [shopping, "買う物"],
      [home, "家"],
    ]);
    expect((await board.get()).sections.map((s) => s.tagId)).toEqual([shopping, home]);
  });

  it("名前を変えても板の版は進まず、変える前の版をもとにした保存もタグを付けたまま通る", async ({
    board,
  }) => {
    const shopping = await board.tags.addId("買い物");
    const first = await board.put([{ id: null, content: "a", tagId: shopping }]);
    const [a] = first.body.sections;
    await board.tags.rename(shopping, "買う物");
    expect((await board.get()).revision).toBe(first.body.revision);
    const saved = await board.put([
      { id: a!.id, content: "a2", createdAt: a!.createdAt, tagId: shopping },
    ]);
    expect(saved.status).toBe(200);
    expect(saved.body.sections).toMatchObject([{ content: "a2", tagId: shopping }]);
  });

  it("新しい名前のタグがもうあれば 409 TagExists で断り、一覧を変えない", async ({ board }) => {
    const shopping = await board.tags.addId("買い物");
    await board.tags.add("家");
    const res = await board.tags.rename(shopping, "家");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "TagExists" });
    expect(await board.tags.names()).toEqual(["買い物", "家"]);
  });

  it("無いタグ (別の場所で登録を消された) の名前を変えようとしたら 404 TagNotFound で断り、新しい名前で登録しない", async ({
    board,
  }) => {
    const shopping = await board.tags.addId("買い物");
    await board.tags.add("家");
    await board.tags.remove(shopping);
    const res = await board.tags.rename(shopping, "買う物");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "TagNotFound" });
    expect(await board.tags.names()).toEqual(["家"]);
  });

  it("形の正しくない新しい名前は 400 で断る", async ({ board }) => {
    const shopping = await board.tags.addId("買い物");
    expect((await board.tags.rename(shopping, " ")).status).toBe(400);
    expect(await board.tags.names()).toEqual(["買い物"]);
  });

  it("消して同じ名前でまた登録したタグは、別の id になる (消す前に付けていたセクションには付かない)", async ({
    board,
  }) => {
    const before = await board.tags.addId("買い物");
    await board.tags.remove(before);
    const after = await board.tags.addId("買い物");
    expect(after).not.toBe(before);
  });

  it("タグの登録・削除・名前の変更・付けたタグは、他のユーザーには影響しない", async ({
    board,
    otherBoard,
  }) => {
    await board.tags.add("買い物");
    const theirs = await otherBoard.tags.addId("買い物");
    await otherBoard.put([{ id: null, content: "theirs", tagId: theirs }]);
    expect((await board.tags.rename(theirs, "x")).status).toBe(404);
    await board.tags.remove(theirs);
    const [mine] = await board.tags.list();
    await board.tags.remove(mine!.id);
    expect(await otherBoard.tags.names()).toEqual(["買い物"]);
    expect((await otherBoard.get()).sections.map((s) => s.tagId)).toEqual([theirs]);
  });
});

describe.concurrent("保持日数 (30 日固定)", () => {
  /** USER_ID の板に、createdAt に作り、expiresAt を期限とするセクションの行を入れる */
  async function insertSection(db: D1Database, id: string, createdAt: number, expiresAt: number) {
    await db
      .prepare(
        "insert into memo (id, user_id, content, position, created_at, updated_at, expires_at) values (?, ?, ?, 0, ?, ?, ?)",
      )
      .bind(id, USER_ID, id, createdAt, createdAt, expiresAt)
      .run();
  }

  it("新しく作るセクションの期限は、作成から 30 日", async ({ board }) => {
    const created = await board.put([{ id: null, content: "a" }]);
    const [a] = created.body.sections as (Section & { expiresAt: string })[];
    expect(new Date(a.expiresAt).getTime() - new Date(a.createdAt).getTime()).toBe(30 * DAY_MS);
  });

  it("板の取得は保持日数を返さない", async ({ board }) => {
    expect(await board.get()).not.toHaveProperty("ttlDays");
  });

  it("短い保持日数の頃に作られ、まだ期限の来ていないセクションは、その期限のまま保存できる", async ({
    db,
    board,
  }) => {
    const now = Date.now();
    const createdAt = now - 10 * DAY_MS;
    // 14 日の設定で 10 日前に作った行 (期限は 4 日後)
    await insertSection(db, "old", createdAt, now + 4 * DAY_MS);

    const saved = await board.put([
      { id: "old", content: "edited", createdAt: new Date(createdAt).toISOString() },
    ]);
    expect(saved.status).toBe(200);
    expect(saved.body.sections).toMatchObject([
      { id: "old", content: "edited", expiresAt: new Date(now + 4 * DAY_MS).toISOString() },
    ]);
  });

  it("作成から 30 日たつ前に期限切れになったセクションを古いタブが送り返しても、作り直さない (HAY-60)", async ({
    db,
    board,
  }) => {
    const now = Date.now();
    // 7 日の設定で 10 日前に作り、もう期限を過ぎた行。Cron が中身を消した後に、それを知らないタブが保存する
    await insertSection(db, "expired", now - 10 * DAY_MS, now - 3 * DAY_MS);
    await sweepExpiredMemos(createDb(db), new Date(now));

    const saved = await board.put([
      { id: "expired", content: "old", createdAt: new Date(now - 10 * DAY_MS).toISOString() },
    ]);
    expect(saved.status).toBe(200);
    expect(saved.body.sections).toEqual([null]);
    expect(await board.rows()).toEqual([{ id: "expired", content: "", position: 0 }]);
    expect((await board.get()).sections).toEqual([]);
  });
});
