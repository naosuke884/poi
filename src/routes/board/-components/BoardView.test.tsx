// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardData } from "../-lib/data/board-loader";

// 板そのものはこのテストの対象外 (注意書きの出し方だけを見る)
vi.mock("./board/Board", () => ({ Board: () => <div data-testid="board" /> }));

const { BoardView } = await import("./BoardView");

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

const render = (offline: boolean) => {
  const data: BoardData = {
    sections: [],
    revision: null,
    ttlDays: offline ? undefined : 30,
    offline,
    cachedAt: offline ? Date.UTC(2026, 8, 24, 3, 0) : null,
    userId: "u1",
  };
  return act(async () =>
    root.render(
      <MantineProvider>
        <BoardView data={data} />
      </MantineProvider>,
    ),
  );
};

describe("BoardView", () => {
  it("閲覧のみの注意書きは常在のライブリージョンの中に出し入れする (issue #126)", async () => {
    await render(true);
    const region = container.querySelector('[role="status"]');
    expect(region?.textContent).toMatch(/オフラインのため閲覧のみです/);
    expect(region?.querySelector('[role="alert"]')).toBeNull();

    // オンラインで取り直すと注意書きは消えるが、入れ物は残る
    await render(false);
    expect(container.querySelector('[role="status"]')).toBe(region);
    expect(region?.textContent).toBe("");
  });

  it("画面には出さない h1 で板の見出しを置く (issue #120)", async () => {
    await render(false);
    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("板");
  });

  it("オンラインで開いた板にも空のライブリージョンを置いておく (issue #126)", async () => {
    await render(false);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("");
    expect(container.querySelector('[data-testid="board"]')).not.toBeNull();
  });
});
