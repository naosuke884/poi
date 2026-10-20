// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { createTestRouter, WithRouter } from "@/lib/router-test";

import { NotFound } from "./NotFound";

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

function renderNotFound() {
  act(() =>
    root.render(
      <WithRouter router={createTestRouter()}>
        <MantineProvider>
          <NotFound />
        </MantineProvider>
      </WithRouter>,
    ),
  );
}

describe("NotFound", () => {
  it("見出しで見つからないことを伝え、文書のタイトルにも出す", () => {
    renderNotFound();
    const headings = [...container.querySelectorAll("h1")].map((h) => h.textContent);
    expect(headings).toEqual(["ページが見つかりません"]);
    expect(document.title).toBe("ページが見つかりません | poi");
  });

  it("トップのほか、使い方や規約のページへも移れる (HAY-52)", () => {
    renderNotFound();
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/", "/guide", "/faq", "/terms", "/privacy"]));
  });
});
