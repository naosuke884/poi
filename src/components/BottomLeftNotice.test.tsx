// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BottomLeftNotice } from "./BottomLeftNotice";

let root: Root;

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
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => root.unmount());
});

// Affix は body へのポータルに描かれる
const render = (node: ReactNode) =>
  act(async () => root.render(<MantineProvider>{node}</MantineProvider>));

const closeLabels = () =>
  [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));

describe("BottomLeftNotice", () => {
  it("既定は割り込まない role=status で、エラーは role=alert を指定できる (issue #124)", async () => {
    await render(
      <>
        <BottomLeftNotice title="更新があります" onClose={() => {}} />
        <BottomLeftNotice color="red" role="alert" closeLabel="エラーを閉じる" onClose={() => {}}>
          失敗しました
        </BottomLeftNotice>
      </>,
    );
    const roles = [...document.querySelectorAll('[role="status"], [role="alert"]')].map((el) => [
      el.getAttribute("role"),
      el.textContent,
    ]);
    expect(roles).toEqual([
      ["status", "更新があります"],
      ["alert", "失敗しました"],
    ]);
  });

  it("閉じるボタンの名前でどの通知か区別できる (issue #124)", async () => {
    await render(
      <>
        <BottomLeftNotice title="セクションを削除しました" onClose={() => {}} />
        <BottomLeftNotice raised title="更新があります" onClose={() => {}} />
        <BottomLeftNotice closeLabel="エラーを閉じる" onClose={() => {}}>
          失敗しました
        </BottomLeftNotice>
        <BottomLeftNotice onClose={() => {}}>本文だけ</BottomLeftNotice>
      </>,
    );
    expect(closeLabels()).toEqual([
      "「セクションを削除しました」を閉じる",
      "「更新があります」を閉じる",
      "エラーを閉じる",
      "通知を閉じる",
    ]);
  });
});
