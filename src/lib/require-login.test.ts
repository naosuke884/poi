// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { readCachedBoard, writeCachedBoard } from "@/lib/board-cache";
import { clearOfflineCaches } from "@/lib/require-login";
import { readCachedUser, writeCachedUser } from "@/lib/session-cache";

const board = (content: string) =>
  [{ id: "1", content, expiresAt: "2099-01-01T00:00:00.000Z" }] as Parameters<typeof writeCachedBoard>[1];

describe("clearOfflineCaches", () => {
  beforeEach(() => {
    localStorage.clear();
    writeCachedUser({ id: "me", name: "Me", email: "me@example.com" });
    writeCachedBoard("me", board("mine"));
    writeCachedBoard("other", board("other"));
    writeCachedBoard("third", board("third"));
  });

  it("省略するとキャッシュ済みユーザーの板とユーザー情報を消す", () => {
    clearOfflineCaches();
    expect(readCachedUser()).toBeNull();
    expect(readCachedBoard("me")).toBeNull();
    expect(readCachedBoard("other")).not.toBeNull();
  });

  it("指定したユーザーの板をすべて消す", () => {
    clearOfflineCaches(["me", "other"]);
    expect(readCachedUser()).toBeNull();
    expect(readCachedBoard("me")).toBeNull();
    expect(readCachedBoard("other")).toBeNull();
    expect(readCachedBoard("third")).not.toBeNull();
  });
});
