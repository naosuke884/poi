// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestRouter, WithRouter } from "@/lib/router-test";
import type { BoardSection } from "../-lib/data/board";
import type { BoardData } from "../-lib/data/board-loader";

// API の向こうのサーバー (プロセスの外にあるので、ここだけ偽物にする)。板と版を持つ。
// 板 (Board) は本物なので、フォーカスなどで取り直しが走っても実際の通信には出ていかない。
// 保存 ($put) は置かない: このファイルのテストは板を編集しない
const server = vi.hoisted(() => ({
  revision: "r0" as string | null,
  sections: [] as BoardSection[],
}));

vi.mock("@/lib/api", () => ({
  api: {
    board: {
      $get: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          userId: "u1",
          revision: server.revision,
          sections: server.sections,
          ttlDays: 30,
        }),
      }),
    },
  },
}));

const { BoardView } = await import("./BoardView");
const { HeaderSlotProvider, HeaderSlotTarget } = await import("@/components/HeaderSlot");

let root: Root;
let container: HTMLDivElement;

beforeAll(() => {
  // jsdom に無い API の最小限のスタブ (本物の Board と CodeMirror が使う)
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
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
  window.scrollBy = () => {};
  window.scrollTo = () => {};
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  server.revision = "r0";
  server.sections = [
    {
      id: "s1",
      userId: "u1",
      position: 0,
      content: "牛乳を買う",
      createdAt: "2026-09-20T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
      expiresAt: "2026-10-20T00:00:00.000Z",
    },
  ];
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const router = createTestRouter({ initialPath: "/board" });

/** loader が返す形の板データで描く (offline ならキャッシュから読んだときの形) */
const render = (offline: boolean) => {
  const data: BoardData = {
    sections: server.sections,
    revision: server.revision,
    ttlDays: offline ? undefined : 30,
    offline,
    cachedAt: offline ? Date.UTC(2026, 8, 24, 3, 0) : null,
    userId: "u1",
  };
  return act(async () =>
    root.render(
      <MantineProvider>
        <WithRouter router={router}>
          <HeaderSlotProvider>
            <HeaderSlotTarget />
            <BoardView data={data} />
          </HeaderSlotProvider>
        </WithRouter>
      </MantineProvider>,
    ),
  );
};

/** ヘッダーに「セクションを追加」ボタンが出ているか (板が編集できる状態か) */
const canAddSection = () =>
  [...container.querySelectorAll("[data-header-slot] button")].some(
    (b) => b.textContent === "セクションを追加",
  );

// 本物の板も保存状態やセクション操作の読み上げに role="status" を持つので、[role="status"] の最初の一つでは
// 取れない。見出し (h1) のすぐ後に置いた注意書きの入れ物を取る
const noticeRegion = () => container.querySelector('h1 + [role="status"]');

describe("BoardView", () => {
  it("閲覧のみの注意書きは常在のライブリージョンの中に出し入れする (issue #126)", async () => {
    await render(true);
    const region = noticeRegion();
    expect(region?.textContent).toMatch(/オフラインのため閲覧のみです/);
    expect(region?.querySelector('[role="alert"]')).toBeNull();
    expect(canAddSection()).toBe(false);

    // オンラインで取り直すと注意書きは消えるが、入れ物は残る (板は編集できるものに作り直される)
    await render(false);
    expect(noticeRegion()).toBe(region);
    expect(region?.textContent).toBe("");
    expect(canAddSection()).toBe(true);
  });

  it("画面には出さない h1 で板の見出しを置く (issue #120)", async () => {
    await render(false);
    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("板");
    // jsdom はスタイルを計算しないので、画面から隠す VisuallyHidden で描いていることを見る
    expect(headings[0]?.className).toMatch(/VisuallyHidden/);
  });

  it("オンラインで開いた板にも空のライブリージョンを置いておく (issue #126)", async () => {
    await render(false);
    expect(noticeRegion()?.textContent).toBe("");
    expect(container.querySelector("[data-section]")?.textContent).toContain("牛乳を買う");
  });
});
