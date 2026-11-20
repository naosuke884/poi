// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { createTestRouter, WithRouter } from "@/lib/router-test";

import { CONTACT_URL } from "./ContactLink";
import { SiteFooter } from "./SiteFooter";

let root: Root;
let container: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
});

describe("SiteFooter", () => {
  it("「問い合わせ」のリンクから、問い合わせ先へのメールを書き始められる", () => {
    act(() =>
      root.render(
        <WithRouter router={createTestRouter()}>
          <SiteFooter />
        </WithRouter>,
      ),
    );
    const contact = [...container.querySelectorAll("a")].find(
      (a) => a.textContent === "問い合わせ",
    );
    expect(contact?.getAttribute("href")).toBe(CONTACT_URL);
  });
});
