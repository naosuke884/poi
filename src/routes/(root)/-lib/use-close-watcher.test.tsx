// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useCloseWatcher } from "./use-close-watcher";

/** ブラウザの CloseWatcher の代わり。作られたものを記録し、戻る操作は requestClose で真似る */
class FakeCloseWatcher {
  static instances: FakeCloseWatcher[] = [];
  onclose: (() => void) | null = null;
  destroyed = false;
  constructor() {
    FakeCloseWatcher.instances.push(this);
  }
  requestClose() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.onclose?.();
  }
  destroy() {
    this.destroyed = true;
  }
}

function Probe({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  useCloseWatcher(opened, onClose);
  return null;
}

let root: Root;
const render = (opened: boolean, onClose: () => void) =>
  act(() => root.render(<Probe opened={opened} onClose={onClose} />));
const win = window as { CloseWatcher?: unknown };

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  FakeCloseWatcher.instances = [];
  win.CloseWatcher = FakeCloseWatcher;
  root = createRoot(document.createElement("div"));
});
afterEach(() => {
  act(() => root.unmount());
  delete win.CloseWatcher;
});

describe("useCloseWatcher", () => {
  it("開いている間の戻る操作で onClose を呼ぶ (issue #122)", () => {
    const onClose = vi.fn();
    render(true, onClose);
    expect(FakeCloseWatcher.instances).toHaveLength(1);
    act(() => FakeCloseWatcher.instances[0].requestClose());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("閉じている間は作らず、閉じたら外す (次の戻る操作はルーターに任せる)", () => {
    const onClose = vi.fn();
    render(false, onClose);
    expect(FakeCloseWatcher.instances).toHaveLength(0);
    render(true, onClose);
    render(false, onClose);
    expect(FakeCloseWatcher.instances).toHaveLength(1);
    expect(FakeCloseWatcher.instances[0].destroyed).toBe(true);
    // 開き直すと新しく作る
    render(true, onClose);
    expect(FakeCloseWatcher.instances).toHaveLength(2);
    expect(FakeCloseWatcher.instances[1].destroyed).toBe(false);
  });

  it("開いたまま onClose が変わっても作り直さず、新しい onClose を呼ぶ", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(true, first);
    render(true, second);
    expect(FakeCloseWatcher.instances).toHaveLength(1);
    act(() => FakeCloseWatcher.instances[0].requestClose());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("アンマウントで外す", () => {
    render(true, vi.fn());
    act(() => root.unmount());
    expect(FakeCloseWatcher.instances[0].destroyed).toBe(true);
    root = createRoot(document.createElement("div"));
  });

  it("CloseWatcher の無いブラウザでは何もしない", () => {
    delete win.CloseWatcher;
    const onClose = vi.fn();
    expect(() => render(true, onClose)).not.toThrow();
    expect(onClose).not.toHaveBeenCalled();
  });
});
