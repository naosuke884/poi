// @vitest-environment jsdom
import { act, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { installDialogPolyfill } from "./dialog-test";
import { Modal } from "./Modal";

let root: Root;
let container: HTMLDivElement;
const onClose = vi.fn();

beforeAll(() => {
  installDialogPolyfill();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** 開くボタンとモーダル。onClose で閉じる (呼び出し側の state を false にする) */
function Harness() {
  const [opened, setOpened] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpened(true)}>
        開く
      </button>
      <Modal
        opened={opened}
        onClose={() => {
          onClose();
          setOpened(false);
        }}
        title="保存期間"
      >
        <p>本文</p>
        <button type="button" data-autofocus>
          キャンセル
        </button>
      </Modal>
    </>
  );
}

const button = (name: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent === name || b.getAttribute("aria-label") === name,
  );
const dialog = () => document.querySelector("dialog");

// アプリと同じく StrictMode で描く (開発時に effect が 2 回走っても開閉がずれないことも確かめる)
const renderHarness = () =>
  act(async () =>
    root.render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    ),
  );

async function openModal() {
  await renderHarness();
  const opener = button("開く");
  opener?.focus();
  await act(async () => opener?.click());
  return opener;
}

describe("Modal", () => {
  it("閉じている間は何も描かない", async () => {
    await renderHarness();
    expect(dialog()).toBeNull();
  });

  it("見出しがダイアログの名前になり、本文が説明になる", async () => {
    await openModal();
    const labelledBy = dialog()?.getAttribute("aria-labelledby");
    expect(labelledBy && document.getElementById(labelledBy)?.textContent).toBe("保存期間");
    const describedBy = dialog()?.getAttribute("aria-describedby");
    expect(describedBy && document.getElementById(describedBy)?.textContent).toContain("本文");
  });

  it("見出しは banner ランドマークにならない (header 要素にしない)", async () => {
    await openModal();
    expect(dialog()?.querySelector("header")).toBeNull();
  });

  it("開くと data-autofocus の要素にフォーカスし、閉じると開いたボタンへ戻す", async () => {
    const opener = await openModal();
    expect(dialog()?.open).toBe(true);
    expect(document.activeElement?.textContent).toBe("キャンセル");

    await act(async () => button("閉じる")?.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("ブラウザが閉じたとき (Esc) も onClose を呼び、もう一度開ける", async () => {
    await openModal();
    await act(async () => dialog()?.close());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();

    await act(async () => button("開く")?.click());
    expect(dialog()?.open).toBe(true);
  });

  it("背景を押すと閉じ、中身で押して背景で離したときは閉じない", async () => {
    await openModal();
    const target = dialog();
    if (!target) throw new Error("ダイアログが無い");
    // jsdom では大きさが 0 なので、(10, 10) はダイアログの外 (背景)
    const at = { bubbles: true, clientX: 10, clientY: 10 };
    await act(async () => {
      target.querySelector("p")?.dispatchEvent(new PointerEvent("pointerdown", at));
      target.dispatchEvent(new MouseEvent("click", at));
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      target.dispatchEvent(new PointerEvent("pointerdown", at));
      target.dispatchEvent(new MouseEvent("click", at));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
