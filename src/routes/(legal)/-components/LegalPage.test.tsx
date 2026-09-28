// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ルーターは立てず、Link は行き先を href にしただけの <a> にする
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const { LegalPage } = await import("./LegalPage");

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

describe("LegalPage", () => {
  it("フッターを出し、もう一方の規約や GitHub へ移れるようにする (issue #139)", () => {
    act(() =>
      root.render(
        <MantineProvider>
          <LegalPage title="利用規約" updatedAt="2026 年 9 月 24 日">
            <p>本文</p>
          </LegalPage>
        </MantineProvider>,
      ),
    );
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining(["/", "/terms", "/privacy", "https://github.com/naosuke884/poi"]),
    );
    expect(document.title).toBe("利用規約 | poi");
  });
});
