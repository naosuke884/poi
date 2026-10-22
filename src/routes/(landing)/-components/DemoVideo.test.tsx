// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, expect, it, vi } from "vite-plus/test";

import { DemoVideo } from "./DemoVideo";

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
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

it("デモ動画には muted の属性が付く (iOS の Safari は属性が無いと自動再生しない)", () => {
  // jsdom には再生が無い
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() =>
    root.render(
      <MantineProvider>
        <DemoVideo />
      </MantineProvider>,
    ),
  );
  expect(container.querySelector("video")?.hasAttribute("muted")).toBe(true);
  act(() => root.unmount());
});
