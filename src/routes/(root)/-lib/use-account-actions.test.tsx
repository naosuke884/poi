// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { boardCacheKey } from "@/lib/offline-caches";
import { createTestRouter, WithRouter } from "@/lib/router-test";
import { readCachedUser, writeCachedUser } from "@/lib/session-cache";

type Reply = "ok" | "error" | "offline";

// 認証サーバー (Better Auth。プロセスの外にあるので、ここだけ偽物にする)。この端末のセッション
// (cookie に載っているもの) と今のセッション、残っているユーザーを持つ。endpoint ごとの返し方 (reply) を変えると、
// サーバが断った・通信できなかった場合を作れる
const server = vi.hoisted(() => ({
  sessions: [] as { token: string; userId: string }[],
  activeToken: null as string | null,
  users: [] as string[],
  googleLoginStarted: false,
  reply: {} as Partial<Record<"setActive" | "signOut" | "deleteUser" | "googleLogin", Reply>>,
}));

vi.mock("@/lib/auth-client", () => {
  const respond = async (
    endpoint: keyof typeof server.reply,
    handle: () => { status: number } | null,
  ) => {
    const reply = server.reply[endpoint] ?? "ok";
    if (reply === "offline") throw new TypeError("Failed to fetch");
    if (reply === "error") return { data: null, error: { status: 500 } };
    const error = handle();
    return error ? { data: null, error } : { data: { success: true }, error: null };
  };
  const activeUserId = () => server.sessions.find((s) => s.token === server.activeToken)?.userId;
  return {
    authClient: {
      multiSession: {
        setActive: ({ sessionToken }: { sessionToken: string }) =>
          respond("setActive", () => {
            // 期限切れなどで端末に残っていないセッションには切り替えられない
            if (!server.sessions.some((s) => s.token === sessionToken)) return { status: 401 };
            server.activeToken = sessionToken;
            return null;
          }),
      },
      signOut: () =>
        respond("signOut", () => {
          server.sessions = [];
          server.activeToken = null;
          return null;
        }),
      deleteUser: () =>
        respond("deleteUser", () => {
          const userId = activeUserId();
          server.users = server.users.filter((u) => u !== userId);
          server.sessions = server.sessions.filter((s) => s.userId !== userId);
          server.activeToken = null;
          return null;
        }),
    },
    startGoogleLogin: async () => {
      if ((server.reply.googleLogin ?? "ok") !== "ok") throw new TypeError("Failed to fetch");
      server.googleLoginStarted = true;
    },
  };
});

const { useAccountActions } = await import("./use-account-actions");

let actions: ReturnType<typeof useAccountActions>;
function Probe() {
  actions = useAccountActions();
  return null;
}

let router: ReturnType<typeof createTestRouter>;
// 表示中のページのデータ (板) を取得した回数
let loads = 0;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(async () => {
  server.users = ["me", "other"];
  server.sessions = [
    { token: "mine", userId: "me" },
    { token: "t", userId: "other" },
  ];
  server.activeToken = "mine";
  server.googleLoginStarted = false;
  server.reply = {};
  localStorage.clear();
  router = createTestRouter({ initialPath: "/board", loader: () => void loads++ });
  await router.load();
  loads = 0;
  await act(async () =>
    createRoot(document.createElement("div")).render(
      <WithRouter router={router}>
        <Probe />
      </WithRouter>,
    ),
  );
});

// この端末に残るオフライン閲覧用のキャッシュ (ログイン中のユーザーと、2 アカウント分の板) を置く
function seedOfflineCaches() {
  writeCachedUser({ id: "me", name: "自分" });
  localStorage.setItem(boardCacheKey("me"), JSON.stringify({ sections: [] }));
  localStorage.setItem(boardCacheKey("other"), JSON.stringify({ sections: [] }));
}
const hasBoardCache = (userId: string) => localStorage.getItem(boardCacheKey(userId)) !== null;

describe("useAccountActions", () => {
  it("切り替えに成功したら板を取り直す", async () => {
    await act(() => actions.switchAccount("t"));
    expect(server.activeToken).toBe("t");
    expect(loads).toBe(1);
    expect(actions.runningAction).toBeNull();
    expect(actions.actionError).toBeNull();
  });

  it("API がエラーを返したらその文言、投げたらオフラインの文言を出す", async () => {
    server.sessions = server.sessions.filter((s) => s.token !== "t");
    await act(() => actions.switchAccount("t"));
    expect(actions.actionError).toMatch(/もう一度そのアカウントでログイン/);
    expect(server.activeToken).toBe("mine");
    expect(loads).toBe(0);

    server.reply.setActive = "offline";
    await act(() => actions.switchAccount("t"));
    expect(actions.actionError).toMatch(/オフライン/);
    expect(actions.runningAction).toBeNull();
  });

  it("アカウント追加に成功したら実行中のまま (Google へ遷移する)", async () => {
    await act(() => actions.addAccount());
    expect(server.googleLoginStarted).toBe(true);
    expect(actions.runningAction).toBe("switch");
  });

  it("ログアウトはこの端末の全アカウントのキャッシュを消してトップへ", async () => {
    seedOfflineCaches();
    await act(() => actions.logout());
    expect(server.sessions).toEqual([]);
    expect(readCachedUser()).toBeNull();
    expect(hasBoardCache("me")).toBe(false);
    expect(hasBoardCache("other")).toBe(false);
    expect(router.state.location.pathname).toBe("/");
  });

  it("ログアウトに失敗したらキャッシュは消さない", async () => {
    server.reply.signOut = "offline";
    seedOfflineCaches();
    await act(() => actions.logout());
    expect(readCachedUser()).not.toBeNull();
    expect(hasBoardCache("me")).toBe(true);
    expect(hasBoardCache("other")).toBe(true);
    expect(actions.actionError).toMatch(/ログアウトできません/);
  });

  it("サーバがログアウトに失敗したら、キャッシュを消さずエラーを出す", async () => {
    server.reply.signOut = "error";
    seedOfflineCaches();
    await act(() => actions.logout());
    expect(readCachedUser()).not.toBeNull();
    expect(hasBoardCache("me")).toBe(true);
    expect(hasBoardCache("other")).toBe(true);
    expect(router.state.location.pathname).toBe("/board");
    expect(actions.actionError).toMatch(/ログアウトできませんでした/);
    expect(actions.runningAction).toBeNull();
  });

  it("アカウント削除に成功したら自分のキャッシュを消す", async () => {
    seedOfflineCaches();
    await act(() => actions.deleteAccount("me"));
    expect(server.users).toEqual(["other"]);
    expect(readCachedUser()).toBeNull();
    expect(hasBoardCache("me")).toBe(false);
    // 同じ端末でログインしている他のアカウントの板は残す
    expect(hasBoardCache("other")).toBe(true);
  });
});
