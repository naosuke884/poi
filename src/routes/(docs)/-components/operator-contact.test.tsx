// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { CONTACT_EMAIL, CONTACT_URL, OPERATOR_NAME } from "@/components/ContactLink";
import { createTestRouter, WithRouter } from "@/lib/router-test";

import { Route as PrivacyRoute } from "../privacy";
import { Route as TermsRoute } from "../terms";

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

const pages = [
  ["プライバシーポリシー", PrivacyRoute.options.component],
  ["利用規約", TermsRoute.options.component],
] as const;

describe("運営者と問い合わせ先", () => {
  it.each(pages)("%sに運営者の名前と問い合わせ先が書いてある (HAY-222)", (_name, Page) => {
    if (!Page) throw new Error("ページが無い");
    act(() =>
      root.render(
        <WithRouter router={createTestRouter()}>
          <Page />
        </WithRouter>,
      ),
    );
    const text = container.textContent?.replace(/\s+/g, " ") ?? "";
    expect(text).toContain(`本サービスは ${OPERATOR_NAME} (個人) が運営しています`);
    expect(text).toContain(CONTACT_EMAIL);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(CONTACT_URL);
  });
});
