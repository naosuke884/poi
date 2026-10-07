// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it } from "vitest";
import { useStableHandlers } from "./use-stable-handlers";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let result: { greet(name: string): string } | null = null;
function Probe({ prefix }: { prefix: string }) {
  result = useStableHandlers({ greet: (name: string) => `${prefix} ${name}` });
  return null;
}

describe("useStableHandlers (issue #114)", () => {
  it("描画し直しても同じオブジェクトを返し、呼ぶと最新の描画の関数が動く", async () => {
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe prefix="こんにちは" />));
    const first = result!;
    expect(first.greet("a")).toBe("こんにちは a");
    await act(async () => root.render(<Probe prefix="さようなら" />));
    expect(result).toBe(first);
    expect(result!.greet).toBe(first.greet);
    expect(first.greet("b")).toBe("さようなら b");
    await act(async () => root.unmount());
  });
});
