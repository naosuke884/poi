// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useFocusOnNavigate } from "./use-focus-on-navigate";

// __root.tsx と同じく、#main (tabIndex={-1}) の中にページを描画する最小のルーター
function Layout() {
  useFocusOnNavigate();
  return (
    <>
      <button type="button">メニュー</button>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}
const rootRoute = createRootRoute({ component: Layout });
const pages = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <h1 tabIndex={-1} data-testid="top">
        トップ
      </h1>
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/terms",
    component: () => (
      <h1 tabIndex={-1} data-testid="terms">
        利用規約
      </h1>
    ),
  }),
  // 見出しの無いページ (エラー表示など) は #main へ
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/plain",
    component: () => <p>見出しなし</p>,
  }),
];

let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createTestRouter>;
const createTestRouter = () =>
  createRouter({
    routeTree: rootRoute.addChildren(pages),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // ルーターのスクロール復元が呼ぶ (jsdom には無い)
  window.scrollTo = () => {};
});
beforeEach(async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  router = createTestRouter();
  await act(async () => {
    await router.load();
    root.render(<RouterProvider router={router} />);
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const navigate = (to: string) =>
  act(async () => {
    await router.navigate({ to });
  });
const byTestId = (id: string) => container.querySelector(`[data-testid="${id}"]`);

describe("useFocusOnNavigate", () => {
  it("最初の表示ではフォーカスを動かさない", () => {
    expect(byTestId("top")).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("ページを移ると、移った先の h1 にフォーカスを移す (issue #121)", async () => {
    // メニューなど、遷移で消える / 残る場所にフォーカスがあっても移す
    container.querySelector("button")?.focus();
    await navigate("/terms");
    expect(document.activeElement).toBe(byTestId("terms"));

    await navigate("/");
    expect(document.activeElement).toBe(byTestId("top"));
  });

  it("h1 の無いページでは #main にフォーカスを移す (issue #121)", async () => {
    await navigate("/plain");
    expect(document.activeElement?.id).toBe("main");
  });
});
