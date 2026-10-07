// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const $get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: { board: { $get } } }));
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-client", () => ({ authClient: { getSession } }));

const { loadBoard, loadBoardPage } = await import("./board-loader");
const { isRedirect } = await import("@tanstack/react-router");
const { readCachedUser, writeCachedUser } = await import("@/lib/session-cache");
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

describe("loadBoard", () => {
  it("未ログインなら null", async () => {
    expect(await loadBoard(null)).toBeNull();
    expect($get).not.toHaveBeenCalled();
  });

  it("取得できたら板を返し、キャッシュを最新にする", async () => {
    $get.mockResolvedValue(response(200, { sections, revision: "r1", ttlDays: 7 }));
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
    $get.mockImplementation(async () => {
      // GET を送った後に PUT が完了してキャッシュを書いた
      writeCachedBoard("me", saved, Date.now() + 1);
      return response(200, { sections, ttlDays: 7 });
    });
    await loadBoard(session);
    expect(readCachedBoard("me")?.sections).toEqual(saved);
  });

  it("オフラインならキャッシュを閲覧専用で返す", async () => {
    writeCachedBoard("me", sections, 123);
    $get.mockRejectedValue(new TypeError("fetch failed"));
    expect(await loadBoard(session)).toMatchObject({
      sections,
      revision: null,
      ttlDays: undefined,
      offline: true,
      cachedAt: 123,
    });
  });

  it("オフラインでキャッシュも無ければ OfflineError", async () => {
    $get.mockRejectedValue(new TypeError("fetch failed"));
    await expect(loadBoard(session)).rejects.toBeInstanceOf(OfflineError);
  });

  it("セッションが切れていたらキャッシュを消して null", async () => {
    writeCachedBoard("me", sections);
    $get.mockResolvedValue(response(401));
    expect(await loadBoard(session)).toBeNull();
    expect(readCachedBoard("me")).toBeNull();
  });

  it("それ以外の失敗は投げる", async () => {
    $get.mockResolvedValue(response(500));
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
    getSession.mockResolvedValue({ data: session, error: null });
    $get.mockResolvedValue(response(200, { sections, revision: "r1", ttlDays: 7 }));
    expect(await loadBoardPage()).toMatchObject({ sections, userId: "me" });
  });

  it("サーバが未ログインと答えたら、ユーザー情報のキャッシュを消して / へ", async () => {
    writeCachedUser(session.user);
    getSession.mockResolvedValue({ data: null, error: null });
    expect(await redirectOf(loadBoardPage())).toMatchObject({ to: "/" });
    // 残っているとランディングがまた板へ転送してしまう
    expect(readCachedUser()).toBeNull();
  });

  it("板の取得でセッション切れ (401) が分かったときも / へ", async () => {
    writeCachedUser(session.user);
    getSession.mockResolvedValue({ data: session, error: null });
    $get.mockResolvedValue(response(401));
    expect(await redirectOf(loadBoardPage())).toMatchObject({ to: "/" });
    expect(readCachedUser()).toBeNull();
  });

  it("ログイン状態の確認がサーバのエラーで失敗したら、転送せずに投げる (/ と /board を行き来しないように)", async () => {
    writeCachedUser(session.user);
    getSession.mockResolvedValue({ data: null, error: { status: 500 } });
    await expect(loadBoardPage()).rejects.toThrow("ログイン状態を確認できませんでした");
  });

  it("オフラインなら前回のユーザーのキャッシュの板を出す", async () => {
    writeCachedUser(session.user);
    writeCachedBoard("me", sections, 123);
    getSession.mockRejectedValue(new TypeError("fetch failed"));
    $get.mockRejectedValue(new TypeError("fetch failed"));
    expect(await loadBoardPage()).toMatchObject({ offline: true, sections });
  });
});
