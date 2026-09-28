// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const invalidate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate }) }));

const { OfflineBanner } = await import("./OfflineBanner");

let root: Root;
let container: HTMLDivElement;
let onLine = true;

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
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => onLine });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(async () => {
  vi.clearAllMocks();
  onLine = true;
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () =>
    root.render(
      <MantineProvider>
        <OfflineBanner />
      </MantineProvider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
});

const goOnline = (value: boolean) =>
  act(async () => {
    onLine = value;
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });

describe("OfflineBanner", () => {
  it("ライブリージョンはオンラインの間も置いておき、オフラインで中にバナーを出す (issue #126)", async () => {
    const region = container.querySelector('[role="status"]');
    expect(region).not.toBeNull();
    expect(region?.textContent).toBe("");

    await goOnline(false);
    // 同じ入れ物の中に出る (挿入と同時の中身は読み上げられないことが多い)
    expect(container.querySelector('[role="status"]')).toBe(region);
    expect(region?.textContent).toMatch(/オフラインです/);
    // 入れ物の中に別のライブリージョン (Alert 既定の role="alert") を作らない
    expect(region?.querySelector('[role="alert"]')).toBeNull();

    await goOnline(true);
    expect(container.querySelector('[role="status"]')).toBe(region);
    expect(region?.textContent).toBe("");
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
