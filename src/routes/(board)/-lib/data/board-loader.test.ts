// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const $get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: { board: { $get } } }));
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-client", () => ({ authClient: { getSession } }));

const { loadTopPage, loadTopPageWithView } = await import("./board-loader");
const { writeCachedUser } = await import("@/lib/session-cache");
const { readCachedBoard, writeCachedBoard } = await import("./board-cache");
const { OfflineError } = await import("@/lib/offline");

const session = { user: { id: "me", name: "Me", email: "me@example.com", image: null } };
const sections = [{ id: "1", content: "- a", expiresAt: "2099-01-01T00:00:00.000Z" }] as Parameters<
  typeof writeCachedBoard
>[1];
const response = (status: number, body?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

beforeEach(() => {
  localStorage.clear();
  $get.mockReset();
  getSession.mockReset();
});

describe("loadTopPage", () => {
  it("未ログインならランディング", async () => {
    expect(await loadTopPage(null)).toEqual({ kind: "landing" });
    expect($get).not.toHaveBeenCalled();
  });

  it("取得できたら板を返し、キャッシュを最新にする", async () => {
    $get.mockResolvedValue(response(200, { sections, revision: "r1", ttlDays: 7 }));
    expect(await loadTopPage(session)).toEqual({
      kind: "board",
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
    $get.mockImplementation(async () => {
      // GET を送った後に PUT が完了してキャッシュを書いた
      writeCachedBoard("me", saved, Date.now() + 1);
      return response(200, { sections, ttlDays: 7 });
    });
    await loadTopPage(session);
    expect(readCachedBoard("me")?.sections).toEqual(saved);
  });

  it("オフラインならキャッシュを閲覧専用で返す", async () => {
    writeCachedBoard("me", sections, 123);
    $get.mockRejectedValue(new TypeError("fetch failed"));
    expect(await loadTopPage(session)).toMatchObject({
      kind: "board",
      sections,
      revision: null,
      ttlDays: undefined,
      offline: true,
      cachedAt: 123,
    });
  });

  it("オフラインでキャッシュも無ければ OfflineError", async () => {
    $get.mockRejectedValue(new TypeError("fetch failed"));
    await expect(loadTopPage(session)).rejects.toBeInstanceOf(OfflineError);
  });

  it("セッションが切れていたらキャッシュを消してランディング", async () => {
    writeCachedBoard("me", sections);
    $get.mockResolvedValue(response(401));
    expect(await loadTopPage(session)).toEqual({ kind: "landing" });
    expect(readCachedBoard("me")).toBeNull();
  });

  it("それ以外の失敗は投げる", async () => {
    $get.mockResolvedValue(response(500));
    await expect(loadTopPage(session)).rejects.toThrow("板の取得に失敗しました");
  });
});

/** 手で解決できる Promise (取得の順番を確かめる) */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** 画面のチャンクの取得を記録する (resolve するまで取得中) */
function fakeChunks() {
  const calls: string[] = [];
  const board = deferred<void>();
  const landing = deferred<void>();
  return {
    calls,
    board,
    landing,
    chunks: {
      board: () => (calls.push("board"), board.promise),
      landing: () => (calls.push("landing"), landing.promise),
    },
  };
}

/** 待っている Promise の続きを進める */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("loadTopPageWithView: セッション確認とチャンクの取得を並行させる (issue #110)", () => {
  it("前回ログインしていたら、セッション確認を待たずに板のチャンクを取りに行き、揃ってから返す", async () => {
    writeCachedUser(session.user);
    const sessionRes = deferred<unknown>();
    getSession.mockReturnValue(sessionRes.promise);
    $get.mockResolvedValue(response(200, { sections, revision: "r1", ttlDays: 7 }));
    const f = fakeChunks();

    let done = false;
    const result = loadTopPageWithView(f.chunks).then((page) => {
      done = true;
      return page;
    });
    await flush();
    // セッション確認はまだ返っていないが、チャンクの取得は始まっている
    expect(f.calls).toEqual(["board"]);

    sessionRes.resolve({ data: session, error: null });
    await flush();
    // 板は取れたが、チャンクがまだ
    expect($get).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    f.board.resolve();
    expect(await result).toMatchObject({ kind: "board", sections });
    expect(f.calls).not.toContain("landing");
  });

  it("前回ログインしていなければ、ランディングのチャンクを先に取りに行き、板のチャンクは取らない", async () => {
    const sessionRes = deferred<unknown>();
    getSession.mockReturnValue(sessionRes.promise);
    const f = fakeChunks();

    const result = loadTopPageWithView(f.chunks);
    await flush();
    expect(f.calls).toEqual(["landing"]);

    sessionRes.resolve({ data: null, error: null });
    f.landing.resolve();
    expect(await result).toEqual({ kind: "landing" });
    expect(f.calls).not.toContain("board");
    expect($get).not.toHaveBeenCalled();
  });

  it("予想が外れても (前回ログインしていたがセッション切れ)、ランディングのチャンクを取ってから返す", async () => {
    writeCachedUser(session.user);
    getSession.mockResolvedValue({ data: null, error: null });
    const f = fakeChunks();

    let done = false;
    const result = loadTopPageWithView(f.chunks).then((page) => {
      done = true;
      return page;
    });
    await flush();
    expect(f.calls).toEqual(["board", "landing"]);
    expect(done).toBe(false);

    f.landing.resolve();
    expect(await result).toEqual({ kind: "landing" });
  });
});
