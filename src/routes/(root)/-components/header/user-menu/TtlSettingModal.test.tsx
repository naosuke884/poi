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
});

async function open() {
  // Modal は body へのポータルに描かれる
  await act(async () =>
    root.render(
      <MantineProvider>
        <TtlSettingModal opened onClose={onClose} onSaved={onSaved} />
      </MantineProvider>,
    ),
  );
}

const radioFor = (days: number) =>
  document.querySelector<HTMLInputElement>(`input[type="radio"][value="${days}"]`);
const saveButton = () =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === "保存");
const alertText = () => document.querySelector('[role="alert"]')?.textContent;

afterEach(() => {
  act(() => root.unmount());
});

describe("TtlSettingModal", () => {
  it("ラジオで Enter を押したとき (= form の送信) も保存する (issue #129)", async () => {
    await open();
    const radio = radioFor(7);
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

  it.each([
    ["サーバが断った", () => api.settingsPut.mockResolvedValue({ ok: false, status: 500 })],
    ["通信できなかった", () => api.settingsPut.mockRejectedValue(new TypeError("Failed to fetch"))],
  ])("保存できなかった (%s) ときは閉じずにエラーを出し、onSaved を呼ばない", async (_, failPut) => {
    failPut();
    await open();
    await act(async () => radioFor(7)?.click());
    await act(async () => saveButton()?.click());
    expect(api.settingsPut).toHaveBeenCalled();
    expect(alertText()).toBe("保存できませんでした。接続を確認して、もう一度お試しください。");
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("今の設定を取得できなければエラーを出し、保存させない", async () => {
    api.settingsGet.mockResolvedValue({ ok: false, status: 500 });
    await open();
    expect(alertText()).toBe("設定を取得できませんでした。接続を確認して、開き直してください。");
    expect(saveButton()?.disabled).toBe(true);
    expect(radioFor(7)?.disabled).toBe(true);
  });

  it("板を取得できなくても、エラーにせず保存できる", async () => {
    api.boardGet.mockRejectedValue(new TypeError("Failed to fetch"));
    await open();
    expect(alertText()).toBeUndefined();
    await act(async () => radioFor(7)?.click());
    await act(async () => saveButton()?.click());
    expect(api.settingsPut).toHaveBeenCalledWith({ json: { memoTtlDays: 7 } });
    expect(onSaved).toHaveBeenCalled();
  });
});
