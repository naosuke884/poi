// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { createTestRouter, WithRouter } from "@/lib/router-test";

import { DocPage } from "./DocPage";

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
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
});

describe("DocPage", () => {
  it("フッターを出し、もう一方の規約や GitHub へ移れるようにする (issue #139)", () => {
    act(() =>
      root.render(
        <WithRouter router={createTestRouter()}>
          <MantineProvider>
            <DocPage title="利用規約" updatedAt="2026 年 9 月 24 日">
              <p>本文</p>
            </DocPage>
          </MantineProvider>
        </WithRouter>,
      ),
    );
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining(["/", "/terms", "/privacy", "https://github.com/naosuke884/poi"]),
    );
    expect(document.title).toBe("利用規約 | poi");
  });
});
