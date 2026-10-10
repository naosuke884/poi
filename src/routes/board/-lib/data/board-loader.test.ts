// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Res = { ok: boolean; status: number; json: () => Promise<unknown> };
type Reply = "ok" | "error" | "offline";
type User = { id: string; name: string; email: string; image: string | null };
type Section = { id: string; content: string; expiresAt: string };

// API と Better Auth の向こうのサーバー (プロセスの外にあるので、ここだけ偽物にする)。
// ログイン中のセッションとその人の板を持ち、届いたリクエストを requests に記録する。
// endpoint ごとの返し方 (reply) を変えると、サーバが断った・通信できなかった場合を作れる。
// onBoardGet は板の GET が届いてから答えるまでの間に起きたこと (別の保存・セッション切れ) を表す
const server = vi.hoisted(() => ({
  session: null as { user: User } | null,
  board: { sections: [] as Section[], revision: null as string | null, ttlDays: 30 },
  reply: {} as Partial<Record<"getSession" | "boardGet", Reply>>,
  requests: [] as ("getSession" | "boardGet")[],
  onBoardGet: undefined as (() => void) | undefined,
}));

vi.mock("@/lib/api", () => ({
  api: {
    board: {
      $get: async (): Promise<Res> => {
        const reply = server.reply.boardGet ?? "ok";
        if (reply === "offline") throw new TypeError("Failed to fetch");
        server.requests.push("boardGet");
        server.onBoardGet?.();
        if (reply === "error")
          return { ok: false, status: 500, json: async () => ({ error: "Internal" }) };
        if (!server.session)
          return { ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) };
        const value = { ...server.board };
        return { ok: true, status: 200, json: async () => value };
      },
    },
  },
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    getSession: async () => {
      const reply = server.reply.getSession ?? "ok";
      if (reply === "offline") throw new TypeError("Failed to fetch");
      server.requests.push("getSession");
      if (reply === "error") return { data: null, error: { status: 500 } };
      return { data: server.session, error: null };
    },
  },
}));

const { loadBoard, loadBoardPage } = await import("./board-loader");
const { isRedirect } = await import("@tanstack/react-router");
const { readCachedUser, writeCachedUser } = await import("@/lib/session-cache");
const { readCachedBoard, writeCachedBoard } = await import("./board-cache");
const { OfflineError } = await import("@/lib/offline");

const session = { user: { id: "me", name: "Me", email: "me@example.com", image: null } };
const sections = [{ id: "1", content: "- a", expiresAt: "2099-01-01T00:00:00.000Z" }] as Parameters<
  typeof writeCachedBoard
>[1];

beforeEach(() => {
  localStorage.clear();
  server.session = session;
  server.board = { sections, revision: "r1", ttlDays: 7 };
  server.reply = {};
  server.requests = [];
  server.onBoardGet = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("loadBoard", () => {
  it("未ログインなら板を取りに行かずに null", async () => {
    expect(await loadBoard(null)).toBeNull();
    expect(server.requests).toEqual([]);
  });

  it("取得できたら板を返し、キャッシュを最新にする", async () => {
    expect(await loadBoard(session)).toEqual({
      sections,
      revision: "r1",
      ttlDays: 7,
      offline: false,
      cachedAt: null,
      userId: "me",
    });
    expect(readCachedBoard("me")?.sections).toEqual(sections);
  });

  it("取得中に保存されたキャッシュは、取得した (保存前の) 内容で上書きしない", async () => {
    const saved = [{ ...sections[0]!, content: "- saved" }];
    vi.useFakeTimers({ toFake: ["Date"] });
    // GET を送った後、時間が経ってから PUT が完了してキャッシュを書いた
    server.onBoardGet = () => {
      vi.setSystemTime(Date.now() + 1000);
      writeCachedBoard("me", saved);
    };
    await loadBoard(session);
    expect(readCachedBoard("me")?.sections).toEqual(saved);
  });

  it("オフラインならキャッシュを閲覧専用で返す", async () => {
    writeCachedBoard("me", sections, 123);
    server.reply.boardGet = "offline";
    expect(await loadBoard(session)).toMatchObject({
      sections,
      revision: null,
      ttlDays: undefined,
      offline: true,
      cachedAt: 123,
    });
  });

  it("オフラインでキャッシュも無ければ OfflineError", async () => {
    server.reply.boardGet = "offline";
    await expect(loadBoard(session)).rejects.toBeInstanceOf(OfflineError);
  });

  it("セッションが切れていたらキャッシュを消して null", async () => {
    writeCachedBoard("me", sections);
    server.session = null;
    expect(await loadBoard(session)).toBeNull();
    expect(readCachedBoard("me")).toBeNull();
  });

  it("それ以外の失敗は投げる", async () => {
    server.reply.boardGet = "error";
    await expect(loadBoard(session)).rejects.toThrow("板の取得に失敗しました");
  });
});

/** loader が投げた転送を受け取る (転送しなければ失敗させる) */
async function redirectOf(p: Promise<unknown>) {
  const thrown = await p.then(
    () => expect.unreachable("転送しなかった"),
    (e: unknown) => e,
  );
  if (!isRedirect(thrown)) throw thrown;
  return thrown.options;
}

describe("loadBoardPage: 未ログインならランディングへ転送する (issue #156)", () => {
  it("ログイン済みなら板を返す", async () => {
    expect(await loadBoardPage()).toMatchObject({ sections, userId: "me" });
  });

  it("サーバが未ログインと答えたら、ユーザー情報のキャッシュを消して / へ", async () => {
    writeCachedUser(session.user);
    server.session = null;
    expect(await redirectOf(loadBoardPage())).toMatchObject({ to: "/" });
    // 残っているとランディングがまた板へ転送してしまう
    expect(readCachedUser()).toBeNull();
  });

  it("板の取得でセッション切れ (401) が分かったときも / へ", async () => {
    writeCachedUser(session.user);
    // ログイン状態を確かめた後、板の GET の間にセッションが切れた
    server.onBoardGet = () => {
      server.session = null;
    };
    expect(await redirectOf(loadBoardPage())).toMatchObject({ to: "/" });
    expect(readCachedUser()).toBeNull();
  });

  it("ログイン状態の確認がサーバのエラーで失敗したら、転送せずに投げる (/ と /board を行き来しないように)", async () => {
    writeCachedUser(session.user);
    server.reply.getSession = "error";
    await expect(loadBoardPage()).rejects.toThrow("ログイン状態を確認できませんでした");
  });

  it("オフラインなら前回のユーザーのキャッシュの板を出す", async () => {
    writeCachedUser(session.user);
    writeCachedBoard("me", sections, 123);
    server.reply = { getSession: "offline", boardGet: "offline" };
    expect(await loadBoardPage()).toMatchObject({ offline: true, sections });
  });
});
