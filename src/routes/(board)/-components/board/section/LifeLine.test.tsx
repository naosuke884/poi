// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { DAY_MS } from "@shared/constants";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LifeLine } from "./LifeLine";

let container: HTMLDivElement;
let root: Root;

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
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (props: Parameters<typeof LifeLine>[0]) =>
  act(() =>
    root.render(
      <MantineProvider>
        <LifeLine {...props} />
      </MantineProvider>,
    ),
  );

describe("LifeLine", () => {
  const now = Date.parse("2026-09-28T00:00:00Z");

  it("線とバーを背景で描かない (forced colors で背景は消える。issue #130)", () => {
    render({
      createdAt: new Date(now - 15 * DAY_MS).toISOString(),
      expiresAt: new Date(now + 15 * DAY_MS).toISOString(),
      now,
    });
    const parts = container.querySelectorAll<HTMLElement>("[aria-hidden]");
    expect(parts).toHaveLength(2);
    for (const el of parts) expect(el.style.background).toBe("");
  });

  it("残りの期間の割合と色はカスタムプロパティで渡す", () => {
    render({
      createdAt: new Date(now - 15 * DAY_MS).toISOString(),
      expiresAt: new Date(now + 15 * DAY_MS).toISOString(),
      now,
    });
    const bar = container.querySelectorAll<HTMLElement>("[aria-hidden]")[1];
    expect(bar.style.getPropertyValue("--life-line-ratio")).toBe("50%");
    expect(bar.style.getPropertyValue("--life-line-color")).toBe("var(--mantine-color-dimmed)");
    expect(container.textContent).toContain("あと 15 日");
  });

  it("残り 1 日以下はオレンジ", () => {
    render({
      createdAt: new Date(now - 29 * DAY_MS).toISOString(),
      expiresAt: new Date(now + DAY_MS).toISOString(),
      now,
    });
    const bar = container.querySelectorAll<HTMLElement>("[aria-hidden]")[1];
    expect(bar.style.getPropertyValue("--life-line-color")).toBe(
      "var(--mantine-color-orange-filled)",
    );
  });
});
