// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { boardCacheKey, pruneBoardCaches } from "./offline-caches";

const now = Date.parse("2026-09-28T00:00:00.000Z");
const section = (id: string, expiresAtMs: number) => ({
  id,
  content: `本文 ${id}`,
  expiresAt: new Date(expiresAtMs).toISOString(),
});
const read = (key: string) => JSON.parse(localStorage.getItem(key) ?? "null");

describe("pruneBoardCaches (起動時の掃除。issue #115)", () => {
  beforeEach(() => localStorage.clear());

  it("全ユーザーの板のキャッシュから期限切れのセクションを消す", () => {
    const mine = { sections: [section("a", now), section("b", now + 1)], cachedAt: 1 };
    const other = { sections: [section("c", now - 1)], cachedAt: 2 };
    localStorage.setItem(boardCacheKey("me"), JSON.stringify(mine));
    localStorage.setItem(boardCacheKey("other"), JSON.stringify(other));

    pruneBoardCaches(now);

    expect(read(boardCacheKey("me"))).toEqual({ sections: [mine.sections[1]], cachedAt: 1 });
    expect(read(boardCacheKey("other"))).toEqual({ sections: [], cachedAt: 2 });
    expect(localStorage.getItem(boardCacheKey("other"))).not.toContain("本文 c");
  });

  it("作成から保存期間 (30 日) を過ぎたセクションは、キャッシュの期限がそれより後でも消す (期限を長く設定できた頃のキャッシュ)", () => {
    const old = {
      ...section("old", now + 60 * 86_400_000),
      createdAt: new Date(now - 31 * 86_400_000).toISOString(),
    };
    const fresh = { ...section("fresh", now + 86_400_000), createdAt: new Date(now).toISOString() };
    localStorage.setItem(
      boardCacheKey("me"),
      JSON.stringify({ sections: [old, fresh], cachedAt: 1 }),
    );

    pruneBoardCaches(now);

    expect(read(boardCacheKey("me")).sections.map((s: { id: string }) => s.id)).toEqual(["fresh"]);
  });

  it("残すセクションの期限も、作成から保存期間 (30 日) までに縮めて書き戻す (残り日数を長く見せない)", () => {
    const createdAt = now - 10 * 86_400_000;
    const long = {
      ...section("long", now + 80 * 86_400_000),
      createdAt: new Date(createdAt).toISOString(),
    };
    localStorage.setItem(boardCacheKey("me"), JSON.stringify({ sections: [long], cachedAt: 1 }));

    pruneBoardCaches(now);

    expect(read(boardCacheKey("me")).sections[0].expiresAt).toBe(
      new Date(createdAt + 30 * 86_400_000).toISOString(),
    );
  });

  it("期限の読めないセクションは消し、作成日時の無い (null の) セクションはキャッシュの期限で見る", () => {
    const unreadable = { id: "x", content: "本文 x", expiresAt: "garbage" };
    const missing = { id: "y", content: "本文 y" };
    const unsaved = { ...section("z", now + 86_400_000), createdAt: null };
    localStorage.setItem(
      boardCacheKey("me"),
      JSON.stringify({ sections: [unreadable, missing, unsaved], cachedAt: 1 }),
    );

    pruneBoardCaches(now);

    expect(read(boardCacheKey("me")).sections.map((s: { id: string }) => s.id)).toEqual(["z"]);
  });

  it("セクションの欄が壊れていても (オブジェクトでない) 起動を止めず、そのセクションを消す", () => {
    const live = section("a", now + 1);
    localStorage.setItem(
      boardCacheKey("me"),
      JSON.stringify({ sections: [null, "x", live], cachedAt: 1 }),
    );

    pruneBoardCaches(now);

    expect(read(boardCacheKey("me")).sections).toEqual([live]);
  });

  it("古い形式や壊れたキャッシュは消し、関係ないキーには触らない", () => {
    localStorage.setItem("poi:board-cache:v1:me", JSON.stringify({ lines: ["古い本文"] }));
    localStorage.setItem(boardCacheKey("broken"), JSON.stringify({ lines: [] }));
    localStorage.setItem(boardCacheKey("unparsable"), "{");
    localStorage.setItem("poi:unrelated", "x");

    pruneBoardCaches(now);

    expect(localStorage.getItem("poi:board-cache:v1:me")).toBeNull();
    expect(localStorage.getItem(boardCacheKey("broken"))).toBeNull();
    expect(localStorage.getItem("poi:unrelated")).toBe("x");
  });
});
