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
