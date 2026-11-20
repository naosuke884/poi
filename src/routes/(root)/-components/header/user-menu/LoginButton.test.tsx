// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const startGoogleLogin = vi.fn<() => Promise<void>>(async () => {});
vi.mock("@/lib/auth-client", () => ({ startGoogleLogin: () => startGoogleLogin() }));

const { LoginButton } = await import("./LoginButton");

let root: Root;
let container: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<LoginButton />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  startGoogleLogin.mockReset();
});

const button = () => container.querySelector("button")!;

describe("LoginButton", () => {
  it("押すと Google のログインを始める", async () => {
    startGoogleLogin.mockResolvedValue();
    expect(button().textContent).toBe("Google でログインして始める");
    await act(async () => button().click());
    expect(startGoogleLogin).toHaveBeenCalledTimes(1);
  });

  it("ログインを始められなかったら、エラーを知らせてもう一度押せるようにする", async () => {
    startGoogleLogin.mockRejectedValue(new Error("offline"));
    await act(async () => button().click());
    expect(document.querySelector('[role="alert"]')!.textContent).toContain(
      "ログインを開始できませんでした。接続を確認してもう一度お試しください",
    );
    expect(button().disabled).toBe(false);
  });
});
