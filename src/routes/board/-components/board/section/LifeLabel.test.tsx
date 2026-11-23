// @vitest-environment jsdom
import { DAY_MS } from "@shared/constants";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { LifeLabel } from "./LifeLabel";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
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

const render = (props: Parameters<typeof LifeLabel>[0]) =>
  act(() => root.render(<LifeLabel {...props} />));

describe("LifeLabel", () => {
  const now = Date.parse("2026-09-28T00:00:00Z");
  const at = (daysLeft: number) => ({
    expiresAt: new Date(now + daysLeft * DAY_MS).toISOString(),
    now,
  });

  it("残りの日数を出す", () => {
    render(at(6));
    expect(container.textContent).toBe("あと 6 日");
  });

  it("残り 1 日以下は、文字の色を変える", () => {
    render(at(2));
    const later = container.querySelector("p")!.className;
    render(at(1));
    expect(container.querySelector("p")!.className).not.toBe(later);
  });

  it("未保存のセクションは「新しいセクション」", () => {
    render({ expiresAt: null, now });
    expect(container.textContent).toBe("新しいセクション");
  });
});
