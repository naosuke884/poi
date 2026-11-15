// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { createTestRouter, WithRouter } from "@/lib/router-test";

import { CONTACT_EMAIL, CONTACT_URL, OPERATOR_NAME, OPERATOR_URL } from "./ContactLink";
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
  it("運営者の名前と問い合わせ先を出し、どちらにもたどり着ける (HAY-222)", () => {
    act(() =>
      root.render(
        <WithRouter router={createTestRouter()}>
          <SiteFooter />
        </WithRouter>,
      ),
    );
    const text = container.textContent?.replace(/\s+/g, " ") ?? "";
    expect(text).toContain(`運営者 ${OPERATOR_NAME}`);
    expect(text).toContain(`問い合わせ先 ${CONTACT_EMAIL}`);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining([OPERATOR_URL, CONTACT_URL]));
  });
});
