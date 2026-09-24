// @vitest-environment jsdom

import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { MantineProvider } from "@mantine/core";
import { BOARD_MAX_LENGTH } from "@shared/constants";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardSection } from "../../-lib/board";

// Board をまるごと jsdom にマウントし、エディタ (CodeMirror) の操作 → 画面のセクション → 自動保存の
// PUT までを通しで確かめる。レイアウトが無いので、スクロールや表示上の行の判定は対象外

// 自動保存の PUT / 取り直しの GET を横取りする (保存できた sections の id と内容を記録し、id を振って返す)。
// 送った userId がセッションのユーザー (sessionUserId) と違えば、送った版がサーバの版 (server.revision) と
// 違えば、サーバと同じく 409 を返す。別の端末での保存は server を書き換えて表す。
// expiredOnServer の id は、サーバで期限切れとして作らなかった (null を返す) ことにする
type ServerSection = {
  id: string;
  content: string;
  position: number;
  createdAt: string;
  expiresAt: string;
};
const puts: { id: string | null; content: string }[][] = [];
let sessionUserId = "u";
let server: { revision: string | null; sections: ServerSection[] } = {
  revision: null,
  sections: [],
};
const expiredOnServer = new Set<string>();
const invalidate = vi.fn(async () => {});
vi.mock("@/lib/api", () => ({
  api: {
    board: {
      $put: vi.fn(
        async ({
          json,
        }: {
          json: {
            userId: string;
            revision: string | null;
            sections: { id: string | null; content: string }[];
          };
        }) => {
          if (json.userId !== sessionUserId) {
            return { ok: false, status: 409, json: async () => ({ error: "UserMismatch" }) };
          }
          if (json.revision !== server.revision) {
            return { ok: false, status: 409, json: async () => ({ error: "Stale" }) };
          }
          puts.push(json.sections.map(({ id, content }) => ({ id, content })));
          let n = 0;
          const sections = json.sections.map((s) =>
            s.id !== null && expiredOnServer.has(s.id)
              ? null
              : {
                  id: s.id ?? `new-${puts.length}-${n++}`,
                  content: s.content,
                  position: 0,
                  createdAt: "2026-01-01T00:00:00.000Z",
                  expiresAt: "2099-01-01T00:00:00.000Z",
                },
          );
          const kept = sections
            .filter((s) => s !== null)
            .map((s, position) => Object.assign(s, { position }));
          server = { revision: `r${puts.length}`, sections: kept };
          return {
            ok: true,
            status: 200,
            json: async () => ({ sections, revision: server.revision }),
          };
        },
      ),
      $get: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ userId: sessionUserId, ...server, ttlDays: 30 }),
      })),
    },
  },
}));
const routerStub = { invalidate };
// Board が router から使うのは useBlocker と (保存先のアカウントが違ったときの) invalidate だけ
vi.mock("@tanstack/react-router", () => ({
  useBlocker: () => {},
  useRouter: () => routerStub,
}));

const { Board } = await import("./Board");
const { readCachedBoard } = await import("../../-lib/board-cache");
const { writeCachedUser, clearCachedUser } = await import("@/lib/session-cache");
const { HeaderSlotProvider, HeaderSlotTarget } = await import("@/components/HeaderSlot");

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
/** ヘッダー (HeaderSlot) に出た「セクションを追加」ボタンを押す */
async function addSection() {
  const button = [...container.querySelectorAll("[data-header-slot] button")].find(
    (b) => b.textContent === "セクションを追加",
  );
  if (!(button instanceof HTMLElement)) throw new Error("追加ボタンがありません");
  await act(async () => button.click());
}

let initialSections: BoardSection[] = [];

async function mount(sections: Partial<BoardSection>[], ttlDays = 30) {
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
  initialSections = initial;
  server = { revision: "r0", sections: initial };
  await render(ttlDays);
}

/** 同じ初期値のまま描画し直す (保持日数の変更後の読み込み直しなど。Board は作り直さない) */
async function render(ttlDays: number) {
  await act(async () => {
    root.render(
      <MantineProvider>
        <HeaderSlotProvider>
          <HeaderSlotTarget />
          <Board sections={initialSections} revision="r0" userId="u" ttlDays={ttlDays} />
        </HeaderSlotProvider>
      </MantineProvider>,
    );
  });
}

beforeEach(() => {
  puts.length = 0;
  sessionUserId = "u";
  expiredOnServer.clear();
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
    await addSection();
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
    await addSection();
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
    await addSection();
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
    await addSection();
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
    await addSection();
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
    await addSection();
    await type("- b");
    await waitForSave();
    expect(puts).toEqual([]);
    expect(invalidate).toHaveBeenCalled();
    expect(readCachedBoard("u")).toBeNull();
  });

  // 別の端末 / タブで保存された板 (issue #72)
  const remote = (id: string, content: string, position: number): ServerSection => ({
    id,
    content,
    position,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  });

  it("別の場所で保存されていたら、足されたセクションを消さずに手元の変更と合わせて保存し直す", async () => {
    await mount([{ content: "- a" }]);
    server = { revision: "elsewhere", sections: [remote("id-0", "- a", 0), remote("x", "- x", 1)] };
    await addSection();
    await type("- b");
    // 1 回目の保存は断られ、取り直した板に手元の変更を重ねる
    await waitForSave();
    expect(puts).toEqual([]);
    expect(sectionTexts()).toEqual(["a", "x", "- b"]);
    // 続けて、取り直した版で保存し直す
    await waitForSave();
    expect(puts).toEqual([
      [
        { id: "id-0", content: "- a" },
        { id: "x", content: "- x" },
        { id: null, content: "- b" },
      ],
    ]);
  });

  it("タブに戻ってきたら取り直し、別の場所で保存された内容を取り込む", async () => {
    await mount([{ content: "- a" }, { content: "- b" }]);
    server = {
      revision: "elsewhere",
      sections: [remote("id-0", "- a2", 0), remote("c", "- c", 1)],
    };
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(sectionTexts()).toEqual(["a2", "c"]);
    // 手元の変更は無いので保存しない
    await waitForSave();
    expect(puts).toEqual([]);
  });
});

describe("Board: 期限切れのセクション (issue #74)", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const iso = (ms: number) => new Date(ms).toISOString();

  it("開いている間に期限を過ぎたセクションは、次の保存で送らず画面からも外す", async () => {
    await mount([{ content: "- a", expiresAt: iso(Date.now() - 1000) }, { content: "- b" }]);
    await addSection();
    await type("- c");
    await waitForSave();
    expect(puts.at(-1)).toEqual([
      { id: "id-1", content: "- b" },
      { id: null, content: "- c" },
    ]);
    expect(sectionTexts()).toEqual(["b", "- c"]);
  });

  it("保持日数を短くしたら期限を引き直し、過ぎたセクションを外す (送り返さない)", async () => {
    const now = Date.now();
    await mount([
      { content: "- old", createdAt: iso(now - 10 * DAY), expiresAt: iso(now + 20 * DAY) },
      { content: "- new", createdAt: iso(now - DAY), expiresAt: iso(now + 29 * DAY) },
    ]);
    // 設定の変更後の読み込み直し: Board は作り直さず、保持日数だけが変わる
    await render(7);
    expect(sectionTexts()).toEqual(["new"]);
    await waitForSave();
    // 外したものはサーバでも見えないので、それだけでは保存しない
    expect(puts).toEqual([]);
    await addSection();
    await type("- c");
    await waitForSave();
    expect(puts.at(-1)).toEqual([
      { id: "id-1", content: "- new" },
      { id: null, content: "- c" },
    ]);
  });
});

describe("Board: 別のタブで保持日数を短くした後の保存 (issue #94)", () => {
  it("サーバが期限切れとして作らなかったセクションは画面から外し、書き換えていたものは新しいセクションとして残す", async () => {
    await mount([{ content: "- a" }, { content: "- b" }, { content: "- c" }]);
    // 画面上の期限はまだ先だが、別のタブで保持日数が短くなり、サーバでは a と b がもう期限切れ
    expiredOnServer.add("id-0");
    expiredOnServer.add("id-1");
    await addSection();
    await type("- d");
    await waitForSave();
    expect(puts.at(-1)).toEqual([
      { id: "id-0", content: "- a" },
      { id: "id-1", content: "- b" },
      { id: "id-2", content: "- c" },
      { id: null, content: "- d" },
    ]);
    expect(sectionTexts()).toEqual(["c", "- d"]);
    // 外したものは保存済みの控えからも消えているので、続けて保存はしない
    await waitForSave();
    expect(puts).toHaveLength(1);
  });
});
