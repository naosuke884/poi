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
// 描画に使った方の act。モジュールを読み直したときは、その React の act に揃える
let run = act;

const matchMediaNone = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

beforeAll(() => {
  window.matchMedia ??= matchMediaNone;
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  run(() => root.unmount());
  container.remove();
  window.matchMedia = matchMediaNone;
  run = act;
});

async function renderMenu() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const router = createTestRouter({ initialPath: "/board" });
  await router.load();
  await run(async () =>
    root.render(
      <WithRouter router={router}>
        <MantineProvider env="test">
          <UserMenu />
        </MantineProvider>
      </WithRouter>,
    ),
  );
}

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
  await run(async () => {
    inner.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    button.click();
    await settleFocus();
  });
}

async function openWithKeyboard() {
  const button = trigger();
  await run(async () => {
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    button.click();
    await settleFocus();
  });
}

async function closeMenu() {
  await run(async () => {
    trigger().click();
  });
}

describe("ユーザーメニュー", () => {
  beforeEach(() => renderMenu());

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
    await run(async () => {
      item.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(menu().classList.contains(classes.flat)).toBe(false);
  });
});

describe("ホーム画面に追加 (HAY-125)", () => {
  // 追加済みかはモジュールの読み込み時に決まる (install-prompt.ts)。
  // すでに読み込んだモジュールの状態は戻せないので、ケースごとに読み直す
  async function renderInstallMenu({ standalone }: { standalone: boolean }) {
    window.matchMedia = ((query: string) => ({
      matches:
        query === "(hover: none) and (pointer: coarse)" ||
        (standalone && query === "(display-mode: standalone)"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    vi.resetModules();
    const react = await import("react");
    const { createRoot: createFreshRoot } = await import("react-dom/client");
    const { MantineProvider: FreshProvider } = await import("@mantine/core");
    const { createTestRouter: createFreshRouter, WithRouter: FreshRouter } =
      await import("@/lib/router-test");
    const { UserMenu: FreshMenu } = await import("./UserMenu");
    run = react.act;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createFreshRoot(container);
    const router = createFreshRouter({ initialPath: "/board" });
    await router.load();
    await run(async () =>
      root.render(
        <FreshRouter router={router}>
          <FreshProvider env="test">
            <FreshMenu />
          </FreshProvider>
        </FreshRouter>,
      ),
    );
  }

  function itemLabels() {
    return [...menu().querySelectorAll("[role=menuitem]")].map((el) => el.textContent);
  }

  it("タッチ端末で未追加なら項目を出す", async () => {
    await renderInstallMenu({ standalone: false });
    await openWithPointer();
    expect(itemLabels()).toContain("ホーム画面に追加");
  });

  it("追加済みなら項目を出さない", async () => {
    await renderInstallMenu({ standalone: true });
    await openWithPointer();
    expect(itemLabels()).not.toContain("ホーム画面に追加");
  });

  it("ブラウザのダイアログを出せないときは手順の案内を開く", async () => {
    await renderInstallMenu({ standalone: false });
    await openWithPointer();
    const item = [...menu().querySelectorAll("[role=menuitem]")].find(
      (el) => el.textContent === "ホーム画面に追加",
    );
    if (!(item instanceof HTMLElement)) throw new Error("ホーム画面に追加が無い");
    await run(async () => {
      item.click();
    });
    const dialog = document.querySelector("[role=dialog]");
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toMatch(/ブラウザのメニュー|共有ボタン/);
  });
});
