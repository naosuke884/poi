// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createTestRouter, WithRouter } from "@/lib/router-test";

import classes from "./UserMenu.module.css";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: {
        user: { id: "me", name: "自分", email: "me@example.com", image: null },
      },
      isPending: false,
      error: null,
      refetch: async () => {},
    }),
    multiSession: {
      listDeviceSessions: async () => ({ data: [] }),
    },
    signOut: async () => ({ error: null }),
    deleteUser: async () => ({ error: null }),
  },
  startGoogleLogin: async () => {},
}));

const { UserMenu } = await import("./UserMenu");

let root: Root;
let container: HTMLDivElement;

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const router = createTestRouter({ initialPath: "/board" });
  await router.load();
  await act(async () =>
    root.render(
      <WithRouter router={router}>
        <MantineProvider env="test">
          <UserMenu />
        </MantineProvider>
      </WithRouter>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function trigger() {
  const button = container.querySelector("button");
  if (!button) throw new Error("メニューボタンが無い");
  return button;
}

function menu() {
  const node = container.querySelector("[role=menu]");
  if (!node) throw new Error("メニューが開いていない");
  return node;
}

// フォーカス移動は Mantine が setTimeout で行う (use-focus-trap)
async function settleFocus() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function openWithPointer() {
  const button = trigger();
  const inner = button.firstElementChild ?? button;
  await act(async () => {
    inner.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    button.click();
    await settleFocus();
  });
}

async function openWithKeyboard() {
  const button = trigger();
  await act(async () => {
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    button.click();
    await settleFocus();
  });
}

async function closeMenu() {
  await act(async () => {
    trigger().click();
  });
}

describe("ユーザーメニュー", () => {
  it("タップで開くと最初の項目の強調を消し、キーボードで開くと強調する (HAY-15)", async () => {
    await openWithPointer();
    expect(menu().classList.contains(classes.flat)).toBe(true);
    expect(document.activeElement?.textContent).toContain("アカウントを追加");

    await closeMenu();
    await openWithKeyboard();
    expect(menu().classList.contains(classes.flat)).toBe(false);
    expect(document.activeElement?.textContent).toContain("アカウントを追加");
  });

  it("タップで開き直しても、最初の項目の強調は付いたまま消えている (HAY-15)", async () => {
    await openWithPointer();
    await closeMenu();
    await openWithPointer();
    expect(menu().classList.contains(classes.flat)).toBe(true);
    expect(document.activeElement?.textContent).toContain("アカウントを追加");
  });

  it("タップで開いたあとキーで項目を動かすと強調を戻す (HAY-15)", async () => {
    await openWithPointer();
    const item = document.activeElement;
    if (!(item instanceof HTMLElement)) throw new Error("項目にフォーカスが無い");
    await act(async () => {
      item.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(menu().classList.contains(classes.flat)).toBe(false);
  });
});
