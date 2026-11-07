// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import type { RunningAction } from "../../../-lib/use-account-actions";
import { RunningStatus } from "./RunningStatus";

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

const render = (action: RunningAction | null) =>
  act(async () => root.render(<RunningStatus action={action} />));

describe("RunningStatus", () => {
  it("ライブリージョンは実行前から置いておき、実行中の文言だけを入れ替える (issue #125)", async () => {
    await render(null);
    const region = container.querySelector('[role="status"]');
    expect(region?.textContent).toBe("");

    await render("logout");
    // 同じ要素のまま中身が変わる (挿入と同時の中身は読み上げられないことが多い)
    expect(container.querySelector('[role="status"]')).toBe(region);
    expect(region?.textContent).toBe("ログアウト中…");

    await render("delete");
    expect(region?.textContent).toBe("アカウント削除中…");

    await render(null);
    expect(container.querySelector('[role="status"]')).toBe(region);
    expect(region?.textContent).toBe("");
  });

  it("Loader は見た目だけで読み上げの対象から外す (issue #125)", async () => {
    await render("logout");
    const loader = container.querySelector("[data-loader]");
    expect(loader?.getAttribute("aria-hidden")).toBe("true");
    expect(loader?.getAttribute("aria-label")).toBeNull();

    await render(null);
    expect(container.querySelector("[data-loader]")).toBeNull();
  });
});
