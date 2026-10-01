// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { readCachedUser, writeCachedUser } from "./session-cache";

const KEY = "poi:session:v1";

describe("session-cache (issue #116)", () => {
  beforeEach(() => localStorage.clear());

  it("メールアドレスは端末に保存しない", () => {
    // getSession の user (メールアドレスを含む) をそのまま渡す
    const user = { id: "me", name: "Me", email: "me@example.com", image: null };
    writeCachedUser(user);

    expect(localStorage.getItem(KEY)).not.toContain("me@example.com");
    expect(readCachedUser()).toEqual({ id: "me", name: "Me", image: null });
  });

  it("メールアドレスを含む古いキャッシュは、読んだときにメールアドレスを除いて書き戻す", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ id: "me", name: "Me", email: "me@example.com", image: "https://x/a.png" }),
    );

    expect(readCachedUser()).toEqual({ id: "me", name: "Me", image: "https://x/a.png" });
    expect(localStorage.getItem(KEY)).not.toContain("me@example.com");
  });
});
