// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  settingsGet: vi.fn(),
  settingsPut: vi.fn(),
  boardGet: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: {
    settings: { $get: api.settingsGet, $put: api.settingsPut },
    board: { $get: api.boardGet },
  },
}));

const { TtlSettingModal } = await import("./TtlSettingModal");

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

let root: Root;
const onClose = vi.fn();
const onSaved = vi.fn();

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
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(async () => {
  vi.clearAllMocks();
  api.settingsGet.mockResolvedValue(ok({ memoTtlDays: 30 }));
  api.boardGet.mockResolvedValue(ok({ sections: [] }));
  api.settingsPut.mockResolvedValue(ok({ memoTtlDays: 7 }));
  root = createRoot(document.createElement("div"));
  // Modal は body へのポータルに描かれる
  await act(async () =>
    root.render(
      <MantineProvider>
        <TtlSettingModal opened onClose={onClose} onSaved={onSaved} />
      </MantineProvider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
});

describe("TtlSettingModal", () => {
  it("ラジオで Enter を押したとき (= form の送信) も保存する (issue #129)", async () => {
    const radio = document.querySelector<HTMLInputElement>('input[type="radio"][value="7"]');
    expect(radio).not.toBeNull();
    await act(async () => radio?.click());
    const form = radio?.closest("form");
    expect(form).not.toBeNull();
    // 保存ボタンが form の送信ボタンなので、Enter による暗黙の送信がこのボタンで行われる
    expect(form?.querySelector('button[type="submit"]')?.textContent).toBe("保存");
    await act(async () => form?.requestSubmit());
    expect(api.settingsPut).toHaveBeenCalledWith({ json: { memoTtlDays: 7 } });
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
