// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

type Res = { ok: boolean; status: number; json: () => Promise<unknown> };
type Reply = "ok" | "error" | "offline";

// API の向こうのサーバー (プロセスの外にあるので、ここだけ偽物にする)。今の設定と板を持ち、
// endpoint ごとの返し方 (reply) を変えると、サーバが断った・通信できなかった場合を作れる
const server = vi.hoisted(() => ({
  memoTtlDays: 30,
  sections: [] as { createdAt: string }[],
  reply: {} as Partial<Record<"settingsGet" | "settingsPut" | "boardGet", Reply>>,
}));

vi.mock("@/lib/api", () => {
  const respond = async (
    endpoint: keyof typeof server.reply,
    body: () => unknown,
  ): Promise<Res> => {
    const reply = server.reply[endpoint] ?? "ok";
    if (reply === "offline") throw new TypeError("Failed to fetch");
    if (reply === "error")
      return { ok: false, status: 500, json: async () => ({ error: "Internal" }) };
    const value = body();
    return { ok: true, status: 200, json: async () => value };
  };
  return {
    api: {
      settings: {
        $get: () => respond("settingsGet", () => ({ memoTtlDays: server.memoTtlDays })),
        $put: ({ json }: { json: { memoTtlDays: number } }) =>
          respond("settingsPut", () => {
            server.memoTtlDays = json.memoTtlDays;
            return { memoTtlDays: server.memoTtlDays };
          }),
      },
      board: { $get: () => respond("boardGet", () => ({ sections: server.sections })) },
    },
  };
});

const { TtlSettingModal } = await import("./TtlSettingModal");

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
  server.memoTtlDays = 30;
  server.sections = [];
  server.reply = {};
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
    expect(server.memoTtlDays).toBe(7);
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it.each([
    ["サーバが断った", "error"],
    ["通信できなかった", "offline"],
  ] as const)(
    "保存できなかった (%s) ときは閉じずにエラーを出し、onSaved を呼ばない",
    async (_, reply) => {
      server.reply.settingsPut = reply;
      await open();
      await act(async () => radioFor(7)?.click());
      await act(async () => saveButton()?.click());
      expect(server.memoTtlDays).toBe(30);
      expect(alertText()).toBe("保存できませんでした。接続を確認して、もう一度お試しください。");
      expect(onSaved).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    },
  );

  it("今の設定を取得できなければエラーを出し、保存させない", async () => {
    server.reply.settingsGet = "error";
    await open();
    expect(alertText()).toBe("設定を取得できませんでした。接続を確認して、開き直してください。");
    expect(saveButton()?.disabled).toBe(true);
    expect(radioFor(7)?.disabled).toBe(true);
  });

  it("板を取得できなくても、エラーにせず保存できる", async () => {
    server.reply.boardGet = "offline";
    await open();
    expect(alertText()).toBeUndefined();
    await act(async () => radioFor(7)?.click());
    await act(async () => saveButton()?.click());
    expect(server.memoTtlDays).toBe(7);
    expect(onSaved).toHaveBeenCalled();
  });
});
