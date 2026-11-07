// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { useMediaQuery } from "./use-media-query";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const original = window.matchMedia;
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  window.matchMedia = original;
});

/** フックの今の値を返す。描画し直すたびに更新される */
function renderQuery(query: string, serverValue?: boolean) {
  const result = { current: undefined as boolean | undefined };
  function Probe() {
    result.current = useMediaQuery(query, serverValue);
    return null;
  }
  root = createRoot(document.createElement("div"));
  act(() => root!.render(<Probe />));
  return result;
}

/** matches を外から切り替えられる matchMedia */
function fakeMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
  return (next: boolean) => {
    matches = next;
    for (const l of listeners) l();
  };
}

describe("useMediaQuery", () => {
  it("初回の描画から今の一致を返す", () => {
    fakeMatchMedia(true);
    const result = renderQuery("(hover: none)");
    expect(result.current).toBe(true);
  });

  it("一致が変わると新しい値で描画し直す", () => {
    const set = fakeMatchMedia(false);
    const result = renderQuery("(hover: none)");
    act(() => set(true));
    expect(result.current).toBe(true);
  });

  it("matchMedia が無い環境では serverValue を返す", () => {
    // @ts-expect-error プリレンダーの Node のように matchMedia が無い状態にする
    window.matchMedia = undefined;
    const result = renderQuery("(hover: none)", true);
    expect(result.current).toBe(true);
  });
});
