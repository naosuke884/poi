// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearOfflineCaches } from "@/lib/offline-caches";
import { readCachedUser, writeCachedUser } from "@/lib/session-cache";
import { readCachedBoard, writeCachedBoard } from "./board-cache";

const board = (content: string) =>
  [{ id: "1", content, expiresAt: "2099-01-01T00:00:00.000Z" }] as Parameters<
    typeof writeCachedBoard
  >[1];

// キーの定義 (src/lib/offline-caches.ts) と読み書き (board-cache.ts) が分かれているので、
// 書いたキャッシュが clearOfflineCaches で実際に消えることをここで確かめる
describe("clearOfflineCaches で板のキャッシュを消す", () => {
  beforeEach(() => {
    localStorage.clear();
    writeCachedUser({ id: "me", name: "Me" });
    writeCachedBoard("me", board("mine"));
    writeCachedBoard("other", board("other"));
    writeCachedBoard("third", board("third"));
  });

  it("省略すると全ユーザーの板 (古い形式も) とユーザー情報を消す", () => {
    localStorage.setItem("poi:board-cache:v1:me", "{}");
    localStorage.setItem("poi:unrelated", "x");
    clearOfflineCaches();
    expect(readCachedUser()).toBeNull();
    expect(readCachedBoard("me")).toBeNull();
    expect(readCachedBoard("other")).toBeNull();
    expect(readCachedBoard("third")).toBeNull();
    expect(localStorage.getItem("poi:board-cache:v1:me")).toBeNull();
    expect(localStorage.getItem("poi:unrelated")).toBe("x");
  });

  it("指定したユーザーの板をすべて消す", () => {
    clearOfflineCaches(["me", "other"]);
    expect(readCachedUser()).toBeNull();
    expect(readCachedBoard("me")).toBeNull();
    expect(readCachedBoard("other")).toBeNull();
    expect(readCachedBoard("third")).not.toBeNull();
  });
});

describe("readCachedBoard は期限切れのセクションを端末のキャッシュからも消す (issue #115)", () => {
  const now = Date.parse("2026-09-28T00:00:00.000Z");
  const at = (ms: number) => new Date(ms).toISOString();
  const sections = [
    { id: "past", content: "1 ms 前に期限切れ", expiresAt: at(now - 1) },
    { id: "edge", content: "ちょうど期限", expiresAt: at(now) },
    { id: "live", content: "あと 1 ms", expiresAt: at(now + 1) },
  ] as Parameters<typeof writeCachedBoard>[1];

  beforeEach(() => {
    localStorage.clear();
    writeCachedBoard("me", sections, 123);
  });

  it("期限 (expiresAt <= now) を過ぎたものを除いて返し、localStorage にも書き戻す", () => {
    expect(readCachedBoard("me", now)?.sections.map((s) => s.id)).toEqual(["live"]);
    const stored = JSON.parse(localStorage.getItem("poi:board-cache:v2:me") ?? "null");
    expect(stored).toEqual({ sections: [sections[2]], cachedAt: 123 });
    expect(localStorage.getItem("poi:board-cache:v2:me")).not.toContain("ちょうど期限");
  });

});
