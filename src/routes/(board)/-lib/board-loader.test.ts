// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const $get = vi.hoisted(() => vi.fn());
vi.mock("@/routes/-lib/api", () => ({ api: { board: { $get } } }));

const { loadTopPage } = await import("./board-loader");
const { readCachedBoard, writeCachedBoard } = await import("@/routes/-lib/board-cache");
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
