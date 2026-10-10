// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { EditableSection } from "../data/board";
import { UNDO_DELETE_MS, useUndoableDelete } from "./use-undoable-delete";

// 「元に戻す」の通知が消えるまでの時間を、ホバー / フォーカスで止められるか (#112)。
// 8 秒を実時間で待たないよう、この file だけ setTimeout を偽の時計にする

const sections: EditableSection[] = [
  { key: "a", id: "id-a", content: "- a", createdAt: null, expiresAt: null },
  { key: "b", id: "id-b", content: "- b", createdAt: null, expiresAt: null },
];

let hook: ReturnType<typeof useUndoableDelete>;
function Probe() {
  const latestRef = useRef(sections);
  hook = useUndoableDelete({
    latestRef,
    organized: false,
    focusLater: () => {},
    update: (next) => {
      latestRef.current = next;
    },
  });
  return null;
}

let root: Root;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});

const advance = (ms: number) => act(async () => vi.advanceTimersByTime(ms));
const remove = (returnFocus: (() => void) | null = null, viaKeyboard = false) =>
  act(async () => hook.removeSection("b", { viaKeyboard, returnFocus }));

describe("useUndoableDelete (issue #112)", () => {
  it("何もしなければ UNDO_DELETE_MS で消える", async () => {
    await remove();
    await advance(UNDO_DELETE_MS - 1);
    expect(hook.deleted?.title).toBe("セクションを削除しました");
    await advance(1);
    expect(hook.deleted).toBeNull();
  });

  it("ホバーやフォーカスがある間は消えず、両方離れてから数え直す", async () => {
    await remove();
    await act(async () => hook.holdUndo("hover", true));
    await act(async () => hook.holdUndo("focus", true));
    await advance(UNDO_DELETE_MS * 3);
    expect(hook.deleted).not.toBeNull();
    // ホバーが外れても、フォーカスが残っていれば止めたまま
    await act(async () => hook.holdUndo("hover", false));
    await advance(UNDO_DELETE_MS * 3);
    expect(hook.deleted).not.toBeNull();
    await act(async () => hook.holdUndo("focus", false));
    await advance(UNDO_DELETE_MS - 1);
    expect(hook.deleted).not.toBeNull();
    await advance(1);
    expect(hook.deleted).toBeNull();
  });

  it("マウスで消したときは削除の直後に前後へフォーカスを戻し、キーボードでは閉じたときに戻す", async () => {
    const back = vi.fn();
    await remove(back, false);
    expect(back).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe />));
    back.mockClear();
    await remove(back, true);
    expect(hook.deleted?.focusUndo).toBe(true);
    expect(back).not.toHaveBeenCalled();
    await act(async () => hook.holdUndo("focus", true));
    await act(async () => hook.closeUndo());
    expect(hook.deleted).toBeNull();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("通知の外にフォーカスがあるときに閉じても、フォーカスは動かさない", async () => {
    const back = vi.fn();
    await remove(back, true);
    await act(async () => hook.holdUndo("focus", true));
    await act(async () => hook.holdUndo("focus", false));
    await act(async () => hook.closeUndo());
    expect(back).not.toHaveBeenCalled();
  });
});
