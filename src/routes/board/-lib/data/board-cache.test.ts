// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { clearOfflineCaches } from "@/lib/offline-caches";
import { readCachedUser, writeCachedUser } from "@/lib/session-cache";

import { readCachedBoard, writeCachedBoard, writeCachedTags } from "./board-cache";

type Sections = Parameters<typeof writeCachedBoard>[1]["sections"];
const board = (content: string) => ({
  sections: [{ id: "1", content, expiresAt: "2099-01-01T00:00:00.000Z" }] as Sections,
});

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
  ] as Sections;

  beforeEach(() => {
    localStorage.clear();
    writeCachedBoard("me", { sections }, 123);
  });

  it("期限 (expiresAt <= now) を過ぎたものを除いて返し、localStorage にも書き戻す", () => {
    expect(readCachedBoard("me", now)?.sections.map((s) => s.id)).toEqual(["live"]);
    const stored = JSON.parse(localStorage.getItem("poi:board-cache:v2:me") ?? "null");
    expect(stored).toEqual({ sections: [sections[2]], cachedAt: 123, tags: [] });
    expect(localStorage.getItem("poi:board-cache:v2:me")).not.toContain("ちょうど期限");
  });
});

describe("登録済みのタグのキャッシュ", () => {
  const tag = { id: "t1", name: "家", icon: "home" } as const;
  beforeEach(() => {
    localStorage.clear();
    writeCachedUser({ id: "me", name: "Me" });
  });

  it("板と一緒に書いた一覧を返し、タグを渡さない書き込み (保存の返事) では前の一覧を残す", () => {
    writeCachedBoard("me", { ...board("a"), tags: [tag] }, 1);
    writeCachedBoard("me", board("b"), 2);
    expect(readCachedBoard("me")).toMatchObject({ sections: [{ content: "b" }], tags: [tag] });
  });

  it("タグだけの書き換えは板の中身と時刻を変えず、キャッシュが無ければ何もしない", () => {
    writeCachedTags("me", [tag]);
    expect(readCachedBoard("me")).toBeNull();
    writeCachedBoard("me", board("a"), 1);
    writeCachedTags("me", [tag]);
    expect(readCachedBoard("me")).toEqual({ ...board("a"), cachedAt: 1, tags: [tag] });
  });

  it("ログイン中のユーザーの板でなければ (ログアウト / 切り替えの後に届いた一覧)、タグを書かない", () => {
    writeCachedBoard("other", board("a"), 1);
    writeCachedTags("other", [tag]);
    expect(readCachedBoard("other")?.tags).toEqual([]);
  });

  it("壊れた欄 (本文が文字列でないセクション、id や名前の無いタグ) は読まない (板を描けなくなるので)", () => {
    const [ok] = board("a").sections;
    localStorage.setItem(
      "poi:board-cache:v2:me",
      JSON.stringify({
        sections: [{ ...ok, id: "2", content: null }, ok],
        cachedAt: 1,
        tags: [null, { id: 1 }, tag],
      }),
    );
    expect(readCachedBoard("me")).toMatchObject({ sections: [ok], tags: [tag] });
  });

  it("タグの導入前に書いたキャッシュ (tags が無く、セクションに名前の tag が残る) も読め、タグの一覧は空", () => {
    localStorage.setItem(
      "poi:board-cache:v2:me",
      JSON.stringify({
        sections: [{ id: "1", content: "a", tag: "家", expiresAt: "2099-01-01T00:00:00.000Z" }],
        cachedAt: 1,
      }),
    );
    expect(readCachedBoard("me")).toMatchObject({ sections: [{ content: "a" }], tags: [] });
  });
});
