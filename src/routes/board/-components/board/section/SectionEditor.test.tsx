// @vitest-environment jsdom
import { EditorView } from "@codemirror/view";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { SectionEditor, type SectionEditorHandle } from "./SectionEditor";

// visual viewport の resize でカーソルへスクロールし直す処理 (#45) が、指でスクロールしている間は
// 動かないこと (#137)。ソフトキーボードは visual viewport の高さを変えて真似る

class FakeVisualViewport extends EventTarget {
  height = window.innerHeight;
  offsetTop = 0;
  /** 画面下端から hidden px が隠れた状態にして resize を飛ばす */
  hideBottom(hidden: number) {
    this.height = window.innerHeight - hidden;
    this.dispatchEvent(new Event("resize"));
  }
}

let vv: FakeVisualViewport;
let container: HTMLElement;
let root: Root;
let scrolls: number;

beforeAll(() => {
  // jsdom に無い API の最小限のスタブ (Board.test.tsx と同じ)
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
  window.scrollBy = () => {};
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(async () => {
  vv = new FakeVisualViewport();
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  scrolls = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const ref = createRef<SectionEditorHandle>();
  await act(async () => {
    root.render(
      <SectionEditor
        ref={ref}
        value={"一行目\n二行目"}
        onChange={() => {}}
        onFocus={() => {}}
        onBlur={() => {}}
        onBackspaceAtStart={() => {}}
        onDeleteAtEnd={() => {}}
        onArrowUpAtFirstLine={() => false}
        onArrowDownAtLastLine={() => false}
        onEscape={() => {}}
        getMaxLength={() => 1000}
        aria-label="セクション 1"
      />,
    );
  });
  // カーソルへのスクロールを頼んだ dispatch を数える
  const view = editor();
  const dispatch = view.dispatch.bind(view) as (...specs: unknown[]) => void;
  view.dispatch = ((...specs: unknown[]) => {
    if (specs.some((s) => (s as { scrollIntoView?: boolean } | null)?.scrollIntoView)) scrolls++;
    dispatch(...specs);
  }) as EditorView["dispatch"];
  await act(async () => ref.current?.focus(0));
  scrolls = 0;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function editor(): EditorView {
  const el = container.querySelector<HTMLElement>(".cm-editor");
  if (!el) throw new Error("editor not found");
  return EditorView.findFromDOM(el) as EditorView;
}

describe("SectionEditor: キーボードが開いたときのスクロール", () => {
  it("フォーカスした後に画面が縮んだら (キーボードが開いた)、カーソルへスクロールする", () => {
    expect(editor().hasFocus).toBe(true);
    vv.hideBottom(300);
    expect(scrolls).toBe(1);
  });

  it("指でスクロールし始めた後は、画面が縮んでもカーソルへ引き戻さない (#137)", () => {
    window.dispatchEvent(new Event("touchmove"));
    vv.hideBottom(56); // スクロール中のアドレスバーの伸縮など
    vv.hideBottom(300);
    expect(scrolls).toBe(0);
  });

  it("スクロールした後でも、エディタをタップすればまた追う", () => {
    window.dispatchEvent(new Event("touchmove"));
    editor().contentDOM.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    vv.hideBottom(300);
    expect(scrolls).toBe(1);
  });
});
