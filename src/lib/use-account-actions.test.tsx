// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  setActive: vi.fn(),
  listDeviceSessions: vi.fn(),
  signOut: vi.fn(),
  deleteUser: vi.fn(),
  startGoogleLogin: vi.fn(),
}));
const router = vi.hoisted(() => ({
  invalidate: vi.fn(async () => {}),
  navigate: vi.fn(async () => {}),
}));
const clearOfflineCaches = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    multiSession: { setActive: auth.setActive, listDeviceSessions: auth.listDeviceSessions },
    signOut: auth.signOut,
    deleteUser: auth.deleteUser,
  },
  startGoogleLogin: auth.startGoogleLogin,
}));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => router }));
vi.mock("@/lib/require-login", () => ({ clearOfflineCaches }));

const { useAccountActions } = await import("@/lib/use-account-actions");

let actions: ReturnType<typeof useAccountActions>;
function Probe() {
  actions = useAccountActions();
  return null;
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(async () => {
  vi.clearAllMocks();
  await act(async () => createRoot(document.createElement("div")).render(<Probe />));
});

describe("useAccountActions", () => {
  it("切り替えに成功したら板を取り直す", async () => {
    auth.setActive.mockResolvedValue({ error: null });
    await act(() => actions.switchAccount("t"));
    expect(router.invalidate).toHaveBeenCalled();
    expect(actions.runningAction).toBeNull();
    expect(actions.actionError).toBeNull();
  });

  it("API がエラーを返したらその文言、投げたらオフラインの文言を出す", async () => {
    auth.setActive.mockResolvedValue({ error: { status: 401 } });
    await act(() => actions.switchAccount("t"));
    expect(actions.actionError).toMatch(/もう一度そのアカウントでログイン/);
    expect(router.invalidate).not.toHaveBeenCalled();

    auth.setActive.mockRejectedValue(new TypeError("fetch failed"));
    await act(() => actions.switchAccount("t"));
    expect(actions.actionError).toMatch(/オフライン/);
    expect(actions.runningAction).toBeNull();
  });

  it("アカウント追加に成功したら実行中のまま (Google へ遷移する)", async () => {
    auth.startGoogleLogin.mockResolvedValue(undefined);
    await act(() => actions.addAccount());
    expect(actions.runningAction).toBe("switch");
  });

  it("ログアウトはこの端末の全アカウントのキャッシュを消してトップへ", async () => {
    auth.listDeviceSessions.mockResolvedValue({
      data: [{ user: { id: "me" } }, { user: { id: "b" } }],
    });
    auth.signOut.mockResolvedValue({});
    await act(() => actions.logout("me"));
    expect(clearOfflineCaches).toHaveBeenCalledWith(["me", "b"]);
    expect(router.navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("ログアウトに失敗したらキャッシュは消さない", async () => {
    auth.listDeviceSessions.mockRejectedValue(new TypeError());
    auth.signOut.mockRejectedValue(new TypeError());
    await act(() => actions.logout("me"));
    expect(clearOfflineCaches).not.toHaveBeenCalled();
    expect(actions.actionError).toMatch(/ログアウトできません/);
  });

  it("サーバがログアウトに失敗したら、キャッシュを消さずエラーを出す", async () => {
    auth.listDeviceSessions.mockResolvedValue({ data: [{ user: { id: "me" } }] });
    auth.signOut.mockResolvedValue({ data: null, error: { status: 500 } });
    await act(() => actions.logout("me"));
    expect(clearOfflineCaches).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(actions.actionError).toMatch(/ログアウトできませんでした/);
    expect(actions.runningAction).toBeNull();
  });

  it("アカウント削除に成功したら自分のキャッシュを消す", async () => {
    auth.deleteUser.mockResolvedValue({ error: null });
    await act(() => actions.deleteAccount("me"));
    expect(clearOfflineCaches).toHaveBeenCalledWith(["me"]);
  });
});
