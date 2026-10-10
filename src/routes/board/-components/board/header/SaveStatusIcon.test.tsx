// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import type { SaveState, SaveStatus } from "../../../-lib/sections/save-status";
import { SaveStatusIcon } from "./SaveStatusIcon";

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

const show = (status: SaveStatus | null, errorMessage: string | null = null) => {
  const state: SaveState | null = status && { status, errorMessage, retry: () => {} };
  return act(async () =>
    root.render(
      <MantineProvider>
        <SaveStatusIcon state={state} />
      </MantineProvider>,
    ),
  );
};

const region = (role: "alert" | "status") => container.querySelector(`[role="${role}"]`);

describe("SaveStatusIcon", () => {
  it("ふだんの保存の流れはライブリージョンに入れない (issue #113)", async () => {
    await show("saved");
    const alert = region("alert");
    const status = region("status");
    for (const s of ["dirty", "saving", "saved"] as const) {
      await show(s);
      // リージョンは同じ要素のまま空
      expect(region("alert")).toBe(alert);
      expect(region("status")).toBe(status);
      expect(alert?.textContent).toBe("");
      expect(status?.textContent).toBe("");
    }
    // 今の状態は隠しテキストとして読める
    expect(container.textContent).toContain("保存済み");
  });

  it("失敗は alert で伝え、戻って保存できたら status で「保存済み」と読む (issue #113)", async () => {
    await show("dirty");
    await show("error", "500");
    expect(region("alert")?.textContent).toBe("保存に失敗: 500");
    expect(region("status")?.textContent).toBe("");

    await show("saving");
    await show("saved");
    expect(region("alert")?.textContent).toBe("");
    expect(region("status")?.textContent).toBe("保存済み");
  });

  it("閲覧のみ (state なし) でもリージョンは置いておく", async () => {
    await show(null);
    expect(region("alert")?.textContent).toBe("");
    expect(region("status")?.textContent).toBe("");
  });
});
