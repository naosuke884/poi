// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createTestRouter, WithRouter } from "@/lib/router-test";

import { LoginCta } from "./LoginCta";

const X_IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter/10.60.0";
const SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
// ホーム画面から開いた iOS は Safari/ が無く、WKWebView と同じ UA になる
const IOS_HOME_SCREEN_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

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
  vi.restoreAllMocks();
  delete (navigator as Navigator & { standalone?: boolean }).standalone;
});

function renderWithUserAgent(userAgent: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  act(() =>
    root.render(
      <WithRouter router={createTestRouter()}>
        <MantineProvider>
          <LoginCta />
        </MantineProvider>
      </WithRouter>,
    ),
  );
}

const buttonLabels = () => [...container.querySelectorAll("button")].map((b) => b.textContent);

describe("LoginCta", () => {
  it("普通のブラウザでは Google のログインボタンを出す", () => {
    renderWithUserAgent(SAFARI_UA);
    expect(buttonLabels()).toEqual(["Google でログインして始める"]);
  });

  it("iOS のホーム画面から開いたときは、アプリ内ブラウザの案内を出さずログインボタンを出す (HAY-125)", () => {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    renderWithUserAgent(IOS_HOME_SCREEN_UA);
    expect(buttonLabels()).toEqual(["Google でログインして始める"]);
  });

  it("アプリ内ブラウザではログインボタンの代わりに、ブラウザで開き直す案内と URL のコピーを出す", () => {
    renderWithUserAgent(X_IOS_UA);
    expect(buttonLabels()).toEqual(["URL をコピー"]);
    expect(container.textContent).toContain("Safari や Chrome などのブラウザで開いてください");
  });

  it("URL をコピーすると、トップページの URL をクリップボードに入れて結果を知らせる", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderWithUserAgent(X_IOS_UA);
    await act(async () => container.querySelector("button")!.click());
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/`);
    expect(container.querySelector('[role="status"]')!.textContent).toBe(
      "URL をコピーしました。Safari や Chrome に貼り付けて開いてください",
    );
  });
});
