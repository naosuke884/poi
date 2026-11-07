// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { installDialogPolyfill } from "../../dialog-test";
import { DeleteAccountConfirmModal } from "./DeleteAccountConfirmModal";

let root: Root;
let container: HTMLDivElement;
const onClose = vi.fn();
const onConfirm = vi.fn();

beforeAll(() => {
  installDialogPolyfill();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(async () => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root.render(<DeleteAccountConfirmModal opened onClose={onClose} onConfirm={onConfirm} />),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (name: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === name);

describe("DeleteAccountConfirmModal", () => {
  it("見出しが無くてもダイアログに名前がある (issue #123)", () => {
    const dialog = document.querySelector("dialog[open]");
    expect(dialog?.getAttribute("aria-label")).toBe("アカウント削除の確認");
    // 見た目は見出し無しのまま
    expect(dialog?.querySelector("h2")).toBeNull();
    // 本文は説明として読み上げられる
    const describedBy = dialog?.getAttribute("aria-describedby");
    expect(describedBy && document.getElementById(describedBy)?.textContent).toMatch(
      /アカウントを削除しますか/,
    );
  });

  it("開いたときのフォーカスは「削除する」ではなくキャンセルに置く", () => {
    expect(document.activeElement).toBe(button("キャンセル"));
  });

  it("「削除する」で閉じてから削除を呼び、キャンセルは閉じるだけ", async () => {
    await act(async () => button("キャンセル")?.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    await act(async () => button("削除する")?.click());
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
