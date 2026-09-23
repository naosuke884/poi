// @vitest-environment jsdom

import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { MantineProvider } from "@mantine/core";
import { BOARD_MAX_LENGTH } from "@worker/memo/constants";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardSection } from "@/lib/board";

// Board をまるごと jsdom にマウントし、エディタ (CodeMirror) の操作 → 画面のセクション → 自動保存の
// PUT までを通しで確かめる。レイアウトが無いので、スクロールや表示上の行の判定は対象外

// 自動保存の PUT を横取りする (送った sections を記録し、id を振って返す)。
// 送った userId がセッションのユーザー (sessionUserId) と違えば、サーバと同じく 409 を返す
const puts: { id: string | null; content: string }[][] = [];
let sessionUserId = "u";
const invalidate = vi.fn(async () => {});
vi.mock("@/lib/api", () => ({
  api: {
    board: {
      $put: vi.fn(
        async ({
          json,
        }: {
          json: { userId: string; sections: { id: string | null; content: string }[] };
        }) => {
          if (json.userId !== sessionUserId) {
            return { ok: false, status: 409, json: async () => ({ error: "UserMismatch" }) };
          }
          puts.push(json.sections);
          let n = 0;
          const sections = json.sections.map((s, position) => ({
            id: s.id ?? `new-${puts.length}-${n++}`,
            content: s.content,
            position,
            expiresAt: "2099-01-01T00:00:00.000Z",
          }));
          return { ok: true, status: 200, json: async () => ({ sections }) };
        },
      ),
    },
  },
}));
const routerStub = { invalidate };
// Board が router から使うのは useBlocker と (保存先のアカウントが違ったときの) invalidate だけ
vi.mock("@tanstack/react-router", () => ({
  useBlocker: () => {},
  useRouter: () => routerStub,
}));

const { Board } = await import("@/components/Board");
const { readCachedBoard } = await import("@/lib/board-cache");
const { writeCachedUser, clearCachedUser } = await import("@/lib/session-cache");
const { useBoardActions } = await import("@/lib/board-actions");

beforeAll(() => {
  // jsdom に無い API の最小限のスタブ
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
  Element.prototype.scrollIntoView ??= () => {};
  // CodeMirror の計測 (coordsAtPos) が使う。レイアウトが無いので空の矩形を返す
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
  window.scrollBy = () => {};
  window.scrollTo = () => {};
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let container: HTMLElement;
let root: Root;
let actions: ReturnType<typeof useBoardActions> = null;

function ActionsProbe() {
  actions = useBoardActions();
  return null;
}

async function mount(sections: Partial<BoardSection>[]) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const initial = sections.map((s, position) => ({
    id: `id-${position}`,
    userId: "u",
    position,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    content: "",
    ...s,
  })) as BoardSection[];
  await act(async () => {
    root.render(
      <MantineProvider>
        <ActionsProbe />
        <Board sections={initial} userId="u" />
      </MantineProvider>,
    );
  });
}

beforeEach(() => {
  puts.length = 0;
  sessionUserId = "u";
  invalidate.mockClear();
  localStorage.clear();
  // ログイン中のユーザー (保存時にオフライン用キャッシュを書くのはこのユーザーのときだけ)
  writeCachedUser({ id: "u", name: "U", email: "u@example.com" });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

/** 画面上の各セクションの内容 (編集中はエディタの doc、それ以外は Markdown 表示の元テキスト) */
function sectionTexts(): string[] {
  return [...container.querySelectorAll<HTMLElement>("[data-section]")].map((box, i) => {
    const editor = box.querySelector<HTMLElement>(".cm-editor");
    if (editor) return EditorView.findFromDOM(editor)!.state.doc.toString();
    return (
      box
        .querySelector<HTMLElement>(`[aria-label^="セクション ${i + 1} ("]`)
        ?.textContent?.trim() ?? ""
    );
  });
}

function editor(): EditorView {
  const el = container.querySelector<HTMLElement>(".cm-editor");
  if (!el) throw new Error("editing section not found");
  return EditorView.findFromDOM(el)!;
}

/** エディタへの入力 (カーソル位置に挿入) */
async function type(text: string) {
  await act(async () => {
    const view = editor();
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: EditorSelection.cursor(from + text.length),
      userEvent: "input.type",
    });
  });
}

async function key(k: string) {
  await act(async () => {
    editor().contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }),
    );
  });
}

/** 自動保存 (入力停止から 1 秒) を待つ */
async function waitForSave() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 1100));
  });
}

describe("Board", () => {
  it("開いた直後はどれも編集していない", async () => {
    await mount([{ content: "- a" }, { content: "- b" }]);
    expect(container.querySelectorAll("[data-section]")).toHaveLength(2);
    expect(container.querySelector(".cm-editor")).toBeNull();
  });

  it("追加したセクションに書くと、自動保存で新しいセクションとして送る", async () => {
    await mount([{ content: "- a" }]);
    await act(async () => actions!.addSection());
    await type("- b");
    expect(sectionTexts()).toEqual(["a", "- b"]);
    await waitForSave();
    expect(puts.at(-1)).toEqual([
      { id: "id-0", content: "- a" },
      { id: null, content: "- b" },
    ]);
  });

  it("空行 2 つでセクションが分かれ、先頭で Backspace すると元に戻る", async () => {
    await mount([{ content: "- a" }]);
    await act(async () => actions!.addSection());
    await type("- x\n\n\n- y");
    expect(container.querySelectorAll("[data-section]")).toHaveLength(3);
    // カーソルは分けた後の「- y」の末尾 → 先頭へ移して Backspace で前と結合
    await act(async () => editor().dispatch({ selection: EditorSelection.cursor(0) }));
    await key("Backspace");
    expect(container.querySelectorAll("[data-section]")).toHaveLength(2);
    expect(editor().state.doc.toString()).toBe("- x- y");
    await waitForSave();
    expect(puts.at(-1)).toEqual([
      { id: "id-0", content: "- a" },
      { id: null, content: "- x- y" },
    ]);
  });

  it("削除して「元に戻す」で元の位置に戻る", async () => {
    await mount([{ content: "- a" }, { content: "- b" }, { content: "- c" }]);
    await act(async () => {
      container.querySelector<HTMLElement>("[aria-label='セクション 2 を削除']")!.click();
    });
    expect(sectionTexts()).toEqual(["a", "c"]);
    const undo = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "元に戻す",
    )!;
    await act(async () => undo.click());
    expect(container.querySelectorAll("[data-section]")).toHaveLength(3);
    await waitForSave();
    // 戻した結果が保存済みと同じなら送らない
    expect(puts).toEqual([]);
  });

  it("自動保存を待たずに離れても、保存してオフライン用キャッシュも更新する", async () => {
    await mount([{ content: "- a" }]);
    await act(async () => actions!.addSection());
    await type("- b");
    await act(async () => root.unmount());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(puts).toEqual([
      [
        { id: "id-0", content: "- a" },
        { id: null, content: "- b" },
      ],
    ]);
    expect(readCachedBoard("u")?.sections.map((s) => s.content)).toEqual(["- a", "- b"]);
    // afterEach の unmount 用に空の root を用意し直す
    root = createRoot(container);
  });

  it("別のセクションで文字を選択していても、クリックしたセクションの編集に切り替わる", async () => {
    await mount([{ content: "- a" }, { content: "- b" }]);
    const view = (i: number) =>
      container.querySelector<HTMLElement>(`[aria-label^="セクション ${i} ("]`)!;
    await act(async () => view(1).click());
    expect(editor().state.doc.toString()).toBe("- a");
    // 編集中のエディタの中に選択を残したまま、セクション 2 の表示をクリックする
    const range = document.createRange();
    range.selectNodeContents(editor().contentDOM);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    await act(async () => view(2).click());
    expect(editor().state.doc.toString()).toBe("- b");
  });

  it("選択がクリックしたセクションの中にあるときは編集に切り替えない", async () => {
    await mount([{ content: "- a" }]);
    const view = container.querySelector<HTMLElement>(`[aria-label^="セクション 1 ("]`)!;
    const range = document.createRange();
    range.selectNodeContents(view);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    await act(async () => view.click());
    expect(container.querySelector(".cm-editor")).toBeNull();
    window.getSelection()!.removeAllRanges();
  });

  it("板全体の文字数上限を超える入力は弾く (自動で足す記号も含めて)", async () => {
    // 他のセクションと区切り (3 文字) で、残りは 7 文字
    await mount([{ content: "x".repeat(BOARD_MAX_LENGTH - 3 - 7) }]);
    await act(async () => actions!.addSection());
    await type("- abc");
    expect(editor().state.doc.toString()).toBe("- abc");
    // 入力した 2 文字だけなら 7 文字に収まるが、記号 `- ` が足されて 9 文字になるので弾く
    await type("\nd");
    expect(editor().state.doc.toString()).toBe("- abc");
    await type("de");
    expect(editor().state.doc.toString()).toBe("- abcde");
    await type("f");
    expect(editor().state.doc.toString()).toBe("- abcde");
  });

  it("ログアウト後に完了した保存では、オフライン用キャッシュを作り直さない", async () => {
    await mount([{ content: "- a" }]);
    await act(async () => actions!.addSection());
    await type("- b");
    // ログアウト (clearOfflineCaches) でキャッシュ済みユーザーが消えた後に保存が完了する
    clearCachedUser();
    await waitForSave();
    expect(puts).toHaveLength(1);
    expect(readCachedBoard("u")).toBeNull();
  });

  it("別のアカウントに切り替わっていたら保存せず、読み込み直す", async () => {
    await mount([{ content: "- a" }]);
    sessionUserId = "other";
    await act(async () => actions!.addSection());
    await type("- b");
    await waitForSave();
    expect(puts).toEqual([]);
    expect(invalidate).toHaveBeenCalled();
    expect(readCachedBoard("u")).toBeNull();
  });
});
