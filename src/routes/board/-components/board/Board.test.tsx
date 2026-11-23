// @vitest-environment jsdom

import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { BOARD_MAX_LENGTH } from "@shared/constants";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createTestRouter, WithRouter } from "@/lib/router-test";

import type { BoardSection } from "../../-lib/data/board";

// Board をまるごと jsdom にマウントし、エディタ (CodeMirror) の操作 → 画面のセクション → 自動保存の
// PUT までを通しで確かめる。レイアウトが無いので、スクロールや表示上の行の判定は対象外

// 自動保存の PUT / 取り直しの GET を横取りする (保存できた sections の id と内容を記録し、id を振って返す)。
// 送った userId がセッションのユーザー (sessionUserId) と違えば、送った版がサーバの版 (server.revision) と
// 違えば、サーバと同じく 409 を返す。別の端末での保存は server を書き換えて表す。
// expiredOnServer の id は、サーバで期限切れとして作らなかった (null を返す) ことにする。
// 登録 (registered) に無いタグの id は、サーバと同じく外して保存する。
// putReply を変えると、通信できなかった (offline) / サーバが断った (500 / 429) 場合を作れる
type ServerSection = {
  id: string;
  content: string;
  // 付けない行はタグなし (タグを使わないテストでは書かなくてよい)
  tagId?: string | null;
  position: number;
  createdAt: string;
  expiresAt: string;
};
// 行の作成日時は今にする (オフライン用キャッシュは、作成から 30 日を過ぎた行を期限より前でも消すため)
const CREATED = new Date().toISOString();
const puts: { id: string | null; content: string }[][] = [];
let sessionUserId = "u";
let server: { revision: string | null; sections: ServerSection[] } = {
  revision: null,
  sections: [],
};
const expiredOnServer = new Set<string>();
// 受け付けた PUT ごとの、各セクションに付けて送ったタグの名前 (puts と同じ並び。登録に無い id は "(登録に無い)")
const tagPuts: (string | null)[][] = [];
// サーバにある登録済みのタグ (登録した順)。id は通し番号で振る (名前から作ると、消して同じ名前で作り直したタグと
// 区別できない)。アイコンはどれも買い物 (アイコンの選び方はサーバのテストで確かめる)
type FakeTag = { id: string; name: string; icon: "shopping" };
let registered: FakeTag[] = [];
let tagSeq = 0;
/** names のタグを (まだ無ければ) 登録の末尾に足す (テストの準備や、別の端末での登録) */
function register(...names: string[]) {
  for (const name of names) {
    if (!registered.some((t) => t.name === name)) {
      registered = [...registered, { id: `tag-${++tagSeq}`, name, icon: "shopping" }];
    }
  }
}
const registeredNames = () => registered.map((t) => t.name);
/** 登録済みのタグ name の id */
function idOf(name: string): string {
  const tag = registered.find((t) => t.name === name);
  if (!tag) throw new Error(`「${name}」は登録されていません`);
  return tag.id;
}
const nameOf = (tagId: string | null | undefined) =>
  tagId == null ? null : (registered.find((t) => t.id === tagId)?.name ?? "(登録に無い)");
/** サーバに保存されている各セクションのタグの名前 */
const serverTags = () => server.sections.map((s) => nameOf(s.tagId));
// リンクのプレビューの題名 (URL → プレビュー) と、届いた問い合わせ
let previews: Record<string, { title: string; siteName: string | null }> = {};
const previewRequests: string[] = [];
// リンクのプレビューの問い合わせを断る (レート制限の 429)
let previewRefused = false;
/** タグの一覧の返事 */
const tagListBody = () => ({ tags: registered });
// タグの登録 / 名前の変更 / 削除の返し方 ("offline" はサーバに届かない)
let tagReply: "ok" | "offline" = "ok";
// タグの登録の返事を遅らせる (登録は済ませ、これが解決するまで返事をしない)
let tagGate: Promise<void> = Promise.resolve();
// タグの一覧の取得 (GET /api/tags) の返事を遅らせる (返事は問い合わせた時点の一覧)
let tagListGate: Promise<void> = Promise.resolve();
// タグの登録を、tagGate を待ってから書く (アイコンを選ぶ間、書くのを待つ本物と同じ)
let tagCommitsLate = false;
// 板の取得 (GET /api/board) の返事を遅らせる
let boardGetGate: Promise<void> = Promise.resolve();
let putReply: "ok" | "offline" | 500 | 429 = "ok";
// navigator.onLine (false なら端末がオフラインだと分かっている)
let onLine = true;
vi.mock("@/lib/api", () => ({
  api: {
    board: {
      $put: async ({
        json,
      }: {
        json: {
          userId: string;
          revision: string | null;
          sections: { id: string | null; content: string; tagId: string | null }[];
        };
      }) => {
        if (putReply === "offline") throw new TypeError("Failed to fetch");
        if (putReply === 500) {
          return { ok: false, status: 500, json: async () => ({ error: "Internal" }) };
        }
        if (putReply === 429) {
          return { ok: false, status: 429, json: async () => ({ error: "TooManyRequests" }) };
        }
        if (json.userId !== sessionUserId) {
          return { ok: false, status: 409, json: async () => ({ error: "UserMismatch" }) };
        }
        if (json.revision !== server.revision) {
          return { ok: false, status: 409, json: async () => ({ error: "Stale" }) };
        }
        puts.push(json.sections.map(({ id, content }) => ({ id, content })));
        tagPuts.push(json.sections.map(({ tagId }) => nameOf(tagId)));
        let n = 0;
        const sections = json.sections.map((s) =>
          s.id !== null && expiredOnServer.has(s.id)
            ? null
            : {
                id: s.id ?? `new-${puts.length}-${n++}`,
                content: s.content,
                // 本物と同じく、登録に無いタグは外して保存する
                tagId: registered.some((t) => t.id === s.tagId) ? s.tagId : null,
                position: 0,
                createdAt: CREATED,
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
      $get: async () => {
        // 本物と同じく、登録済みのタグも一緒に返す。返事は問い合わせた時点の内容 (boardGetGate の間に変わっても)
        const body = { userId: sessionUserId, ...server, ...tagListBody() };
        await boardGetGate;
        return { ok: true, status: 200, json: async () => body };
      },
    },
    // リンクのプレビュー。previews にある URL だけ題名を返す
    "link-preview": {
      $post: async ({ json }: { json: { url: string } }) => {
        previewRequests.push(json.url);
        if (previewRefused) {
          return { ok: false, status: 429, json: async () => ({ error: "TooManyRequests" }) };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ preview: previews[json.url] ?? null }),
        };
      },
    },
    // 登録済みのタグ。本物と同じく、名前の変更はタグの行だけを変え (セクションは id で指す)、削除はそのタグを
    // 付けていたセクションからも外す。どちらも板の版は進めない
    tags: {
      $get: async () => {
        const body = tagListBody();
        await tagListGate;
        return { ok: true, status: 200, json: async () => body };
      },
      $post: async ({ json }: { json: { name: string } }) => {
        if (tagReply === "offline") throw new TypeError("Failed to fetch");
        // 返事 (その時点の一覧) を tagGate の間遅らせる。登録はその前に済ませる (返事だけが遅い) か、
        // tagCommitsLate なら待った後に済ませる (本物はアイコンを選び終えてから書く)
        if (tagCommitsLate) await tagGate;
        register(json.name);
        const body = tagListBody();
        await tagGate;
        return { ok: true, status: 200, json: async () => body };
      },
      $patch: async ({ json }: { json: { id: string; name: string } }) => {
        if (tagReply === "offline") throw new TypeError("Failed to fetch");
        if (!registered.some((t) => t.id === json.id)) {
          return { ok: false, status: 404, json: async () => ({ error: "TagNotFound" }) };
        }
        if (registered.some((t) => t.name === json.name && t.id !== json.id)) {
          return { ok: false, status: 409, json: async () => ({ error: "TagExists" }) };
        }
        renameOnServer(json.id, json.name);
        return { ok: true, status: 200, json: async () => tagListBody() };
      },
      $delete: async ({ json }: { json: { id: string } }) => {
        if (tagReply === "offline") throw new TypeError("Failed to fetch");
        unregisterOnServer(json.id);
        return { ok: true, status: 200, json: async () => tagListBody() };
      },
    },
  },
}));
/** サーバでタグの名前を変える (この画面の操作か、別の端末の操作) */
function renameOnServer(id: string, name: string) {
  registered = registered.map((t) => (t.id === id ? { ...t, name } : t));
}
/** サーバでタグの登録を消し、付けていたセクションからも外す (この画面の操作か、別の端末の操作) */
function unregisterOnServer(id: string) {
  registered = registered.filter((t) => t.id !== id);
  server = {
    ...server,
    sections: server.sections.map((s) => (s.tagId === id ? { ...s, tagId: null } : s)),
  };
}
const { Board } = await import("./Board");
const { resetTagFilterForTest } = await import("../../-lib/tag-filter");
const { clearLinkPreviewsForTest } = await import("../../-lib/link-preview");
const { readCachedBoard } = await import("../../-lib/data/board-cache");
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
  Element.prototype.scrollIntoView ??= () => {};
  // CodeMirror の計測 (coordsAtPos) が使う。レイアウトが無いので空の矩形を返す
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
  window.scrollBy = () => {};
  window.scrollTo = () => {};
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => onLine });
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
let router: ReturnType<typeof createTestRouter>;
// 表示中のページのデータを (読み込み直しで) 取得した回数
let loads = 0;

/** sections の板を userId (既定はログイン中のユーザー u) の板として開く */
async function mount(sections: Partial<BoardSection>[], userId = "u") {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const initial = sections.map((s, position) => ({
    id: `id-${position}`,
    userId: "u",
    position,
    createdAt: CREATED,
    updatedAt: CREATED,
    expiresAt: "2099-01-01T00:00:00.000Z",
    content: "",
    tagId: null,
    ...s,
  })) as BoardSection[];
  initialSections = initial;
  server = { revision: "r0", sections: initial };
  router = createTestRouter({ loader: () => void loads++ });
  await router.load();
  loads = 0;
  await render(userId);
}

async function render(userId = "u") {
  await act(async () => {
    root.render(
      <WithRouter router={router}>
        <HeaderSlotProvider>
          <HeaderSlotTarget />
          <Board sections={initialSections} revision="r0" tags={registered} userId={userId} />
        </HeaderSlotProvider>
      </WithRouter>,
    );
  });
}

beforeEach(() => {
  resetTagFilterForTest();
  puts.length = 0;
  tagPuts.length = 0;
  registered = [];
  tagSeq = 0;
  tagReply = "ok";
  tagGate = Promise.resolve();
  boardGetGate = Promise.resolve();
  tagCommitsLate = false;
  tagListGate = Promise.resolve();
  previews = {};
  previewRequests.length = 0;
  previewRefused = false;
  clearLinkPreviewsForTest();
  sessionUserId = "u";
  expiredOnServer.clear();
  putReply = "ok";
  onLine = true;
  localStorage.clear();
  // ログイン中のユーザー (保存時にオフライン用キャッシュを書くのはこのユーザーのときだけ)
  writeCachedUser({ id: "u", name: "U" });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

/** 「元に戻す」のボタン (通知は body へのポータルに出る)。出ていなければ undefined */
const undoButton = () =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === "元に戻す");

/** 絞り込みのバーのボタンの文字 (並び順) */
const filterLabels = () =>
  [...container.querySelectorAll<HTMLButtonElement>('[aria-label="タグで絞り込む"] button')].map(
    (b) => b.textContent,
  );

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

  it("改行を 3 回打っても (空行 2 つ) セクションは分かれず、空行ごと 1 つのセクションとして保存する", async () => {
    await mount([{ content: "- a" }]);
    await addSection();
    await type("x");
    for (let i = 0; i < 3; i++) await type("\n");
    await type("y");
    expect(container.querySelectorAll("[data-section]")).toHaveLength(2);
    expect(editor().state.doc.toString()).toBe("x\n\n\ny");
    await waitForSave();
    expect(puts.at(-1)).toEqual([
      { id: "id-0", content: "- a" },
      { id: null, content: "x\n\n\ny" },
    ]);
  });

  it("空行が続く文を貼り付けても、1 つのセクションのまま", async () => {
    await mount([{ content: "- a" }]);
    await addSection();
    await act(async () => {
      const view = editor();
      view.dispatch({
        changes: { from: 0, insert: "p\n\n\n\nq" },
        selection: EditorSelection.cursor(6),
        userEvent: "input.paste",
      });
    });
    expect(container.querySelectorAll("[data-section]")).toHaveLength(2);
    expect(editor().state.doc.toString()).toBe("p\n\n\n\nq");
  });

  it("先頭で Backspace すると前のセクションとつながる", async () => {
    await mount([{ content: "- a" }]);
    await addSection();
    await type("- b");
    await act(async () => editor().dispatch({ selection: EditorSelection.cursor(0) }));
    await key("Backspace");
    expect(container.querySelectorAll("[data-section]")).toHaveLength(1);
    expect(editor().state.doc.toString()).toBe("- a- b");
    await waitForSave();
    expect(puts.at(-1)).toEqual([{ id: "id-0", content: "- a- b" }]);
  });

  describe("作ったセクションを画面に収める", () => {
    // jsdom にはレイアウトが無いので、縦に並ぶカード (高さ 150px、間 20px) とページのスクロール位置を
    // 最小限だけ真似る。window.scrollBy / scrollTo で動き (smooth も行き先へすぐ着く)、
    // カードの位置 (getBoundingClientRect) と window.scrollY に反映される。scrollTo の動かし方は控えておく
    let scrollY = 0;
    let behaviors: (ScrollBehavior | undefined)[] = [];
    let reduceMotion = false;
    const original = HTMLElement.prototype.getBoundingClientRect;
    let originalMatchMedia: typeof window.matchMedia;
    beforeEach(() => {
      originalMatchMedia = window.matchMedia;
      scrollY = 0;
      behaviors = [];
      reduceMotion = false;
      Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
      window.scrollBy = ((_x: number, y: number) => {
        scrollY += y;
      }) as typeof window.scrollBy;
      window.scrollTo = ((options: ScrollToOptions) => {
        behaviors.push(options.behavior);
        scrollY = options.top ?? scrollY;
      }) as typeof window.scrollTo;
      window.matchMedia = ((query: string) => {
        const list = originalMatchMedia(query);
        if (query !== "(prefers-reduced-motion: reduce)") return list;
        return Object.assign(Object.create(list) as MediaQueryList, { matches: reduceMotion });
      }) as typeof window.matchMedia;
      HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
        if (!this.hasAttribute("data-section")) return original.call(this);
        const i = [...container.querySelectorAll("[data-section]")].indexOf(this);
        return new DOMRect(0, 600 + i * 170 - scrollY, 800, 150);
      };
    });
    afterEach(() => {
      window.scrollBy = () => {};
      window.scrollTo = () => {};
      window.matchMedia = originalMatchMedia;
      Reflect.deleteProperty(window, "scrollY");
      HTMLElement.prototype.getBoundingClientRect = original;
    });
    const lastBox = () => [...container.querySelectorAll("[data-section]")].at(-1)!;
    const expectFullyVisible = (box: Element) => {
      const r = box.getBoundingClientRect();
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.bottom).toBeLessThanOrEqual(window.innerHeight);
    };

    it("追加したセクションへは滑らかにスクロールして、下端まで (書式のツールバーまで) 画面に収める", async () => {
      await mount([{ content: "- a" }, { content: "- b" }]);
      await addSection();
      expect(lastBox().querySelector(".cm-editor")).not.toBeNull();
      expectFullyVisible(lastBox());
      expect(behaviors.at(-1)).toBe("smooth");
    });

    it("動きを減らす設定なら、追加したセクションへは一気にスクロールする", async () => {
      reduceMotion = true;
      await mount([{ content: "- a" }, { content: "- b" }]);
      await addSection();
      expectFullyVisible(lastBox());
      expect(behaviors).not.toContain("smooth");
    });

    it("追加したセクションが既に画面に収まっていれば、スクロールしない", async () => {
      await mount([{ content: "- a" }]);
      // 2 つ目のカード (600 + 170 〜 +150) が画面 (jsdom の高さ 768px) に収まるところまで先に下げておく
      scrollY = 200;
      await addSection();
      expect(scrollY).toBe(200);
      expect(behaviors).toEqual([]);
    });
  });

  it("削除して「元に戻す」で元の位置に戻る", async () => {
    await mount([{ content: "- a" }, { content: "- b" }, { content: "- c" }]);
    await act(async () => {
      container.querySelector<HTMLElement>("[aria-label='セクション 2 を削除']")!.click();
    });
    expect(sectionTexts()).toEqual(["a", "c"]);
    await act(async () => undoButton()!.click());
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

  it("エディタの名前はセクション番号だけで、Esc の案内は説明として読ませる (issue #127)", async () => {
    await mount([{ content: "- a" }, { content: "- b" }]);
    await act(async () =>
      container.querySelector<HTMLElement>(`[aria-label^="セクション 2 ("]`)!.click(),
    );
    const content = editor().contentDOM;
    expect(content.getAttribute("aria-label")).toBe("セクション 2");
    const describedBy = content.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe("Esc で編集をやめる");
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

  it("板全体の文字数上限を超える入力は弾く (Enter で続ける記号も含めて)", async () => {
    // 他のセクションと区切り (3 文字) で、残りは 7 文字
    await mount([{ content: "x".repeat(BOARD_MAX_LENGTH - 3 - 7) }]);
    await addSection();
    await type("- abc");
    expect(editor().state.doc.toString()).toBe("- abc");
    // 改行 1 文字なら 7 文字に収まるが、Enter は次の項目の記号 `- ` も足して 8 文字になるので弾く
    await key("Enter");
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
    expect(loads).toBe(1);
    expect(readCachedBoard("u")).toBeNull();
  });

  // 別の端末 / タブで保存された板 (issue #72)
  const remote = (id: string, content: string, position: number): ServerSection => ({
    id,
    content,
    position,
    createdAt: CREATED,
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

/** タグを選ぶポップオーバーの操作 (Board: タグ / タグでの絞り込みで使う) */
const tagUi = {
  /** セクション n のタグのボタン (タグが付いていれば、その名前の札) */
  button(n: number) {
    const el = container.querySelector<HTMLButtonElement>(
      `button[aria-label*="セクション ${n} のタグを選ぶ"]`,
    );
    if (!el) throw new Error(`セクション ${n} にタグのボタンがありません`);
    return el;
  },
  popover: () => container.querySelector<HTMLElement>('[role="group"][aria-label$="のタグを選ぶ"]'),
  open: (n: number) => act(async () => tagUi.button(n).click()),
  input: () =>
    tagUi
      .popover()!
      .querySelector<HTMLInputElement>('input[aria-label="タグを探すか、新しく作る"]')!,
  /** 入力欄 (el。省略時は探す / 作る入力欄) に打つ */
  async type(text: string, el: HTMLInputElement = tagUi.input()) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  },
  /** el でキーを押す (省略時は探す / 作る入力欄) */
  press: (key: string, el: Element = tagUi.input()) =>
    act(async () => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }),
  /** ポップオーバーの中の、文字が text のボタン */
  buttonText(text: string) {
    const el = [...(tagUi.popover()?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent === text,
    );
    if (!el) throw new Error(`ポップオーバーに「${text}」がありません`);
    return el;
  },
  /** 一覧の行: [タグの名前, 付いているか] */
  rows: () =>
    [...(tagUi.popover()?.querySelectorAll("li button[aria-pressed]") ?? [])].map((b) => [
      b.textContent,
      b.getAttribute("aria-pressed") === "true",
    ]),
  /** 「…」を押して、その行で名前の変更と削除をできるようにする */
  edit: (name: string) =>
    act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          `button[aria-label="タグ「${name}」の名前を変える・削除する"]`,
        )!
        .click(),
    ),
  renameInput: (name: string) =>
    tagUi
      .popover()!
      .querySelector<HTMLInputElement>(`input[aria-label="タグ「${name}」の新しい名前"]`)!,
  /** セクション n に付いているタグ (付いていなければ null)。タグのボタンの名前の頭に出る (見た目はアイコンだけ) */
  of: (n: number) =>
    / \(セクション \d+ のタグを選ぶ\)$/.test(tagUi.button(n).getAttribute("aria-label") ?? "")
      ? tagUi
          .button(n)
          .getAttribute("aria-label")!
          .replace(/ \(セクション \d+ のタグを選ぶ\)$/, "")
      : null,
};

describe("Board: タグ", () => {
  const click = (el: HTMLElement) => act(async () => el.click());

  it("タグのボタンでポップオーバーを開くと、入力欄にフォーカスがあり、登録済みのタグが並ぶ", async () => {
    register("買い物", "家");
    await mount([{ content: "- a" }, { content: "- b" }]);
    expect(tagUi.popover()).toBeNull();
    await tagUi.open(1);
    expect(document.activeElement).toBe(tagUi.input());
    expect(tagUi.rows()).toEqual([
      ["買い物", false],
      ["家", false],
    ]);
  });

  it("一覧のタグを押すとそのセクションに付いて閉じ、タグのボタンへフォーカスを戻して保存する", async () => {
    register("買い物", "家");
    await mount([{ content: "- a" }, { content: "- b" }]);
    await tagUi.open(1);
    await click(tagUi.buttonText("家"));
    expect(tagUi.popover()).toBeNull();
    expect(tagUi.of(1)).toBe("家");
    expect(document.activeElement).toBe(tagUi.button(1));
    await waitForSave();
    expect(tagPuts.at(-1)).toEqual(["家", null]);
  });

  it("打った文字で一覧を絞り込み、Enter でいちばん上のタグを付ける", async () => {
    register("買い物", "家", "家計");
    await mount([{ content: "- a" }]);
    await tagUi.open(1);
    await tagUi.type("家");
    expect(tagUi.rows()).toEqual([
      ["家", false],
      ["家計", false],
    ]);
    await tagUi.press("ArrowDown");
    await tagUi.press("Enter");
    expect(tagUi.of(1)).toBe("家計");
  });

  it("無い名前を打つと最後に作る行が出て、Enter で登録してそのセクションに付く", async () => {
    register("買い物");
    await mount([{ content: "- a" }, { content: "- b" }]);
    await tagUi.open(1);
    await tagUi.type("#家");
    expect(tagUi.popover()!.querySelector("li:last-child button")?.textContent).toBe("家を作る");
    await tagUi.press("Enter");
    expect(registeredNames()).toEqual(["買い物", "家"]);
    expect(tagUi.of(1)).toBe("家");
    expect(document.activeElement).toBe(tagUi.button(1));
    // 登録したタグは、他のセクションでも選べる
    await tagUi.open(2);
    expect(tagUi.rows()).toEqual([
      ["買い物", false],
      ["家", false],
    ]);
  });

  it("↑↓ で選び直した Enter の行き先を読み上げに伝える (打つたびには伝えない)", async () => {
    register("家", "家計");
    await mount([{ content: "- a" }]);
    await tagUi.open(1);
    const status = () => tagUi.popover()!.querySelector('[role="status"]')!.textContent;
    await tagUi.type("家");
    expect(status()).toBe("");
    await tagUi.press("ArrowDown");
    expect(status()).toBe("「家計」を付ける");
    await tagUi.type("旅");
    expect(status()).toBe("");
    await tagUi.press("ArrowUp");
    expect(status()).toBe("「旅」を作って付ける");
  });

  it("何も打たずに Enter を押しても、何も付けない", async () => {
    register("買い物");
    await mount([{ content: "- a" }]);
    await tagUi.open(1);
    await tagUi.press("Enter");
    expect(tagUi.popover()).not.toBeNull();
    expect(tagUi.of(1)).toBeNull();
  });

  it("登録に失敗したら理由を出し、タグは付けずに開いたままにする", async () => {
    await mount([{ content: "- a" }]);
    await tagUi.open(1);
    tagReply = "offline";
    await tagUi.type("買い物");
    await tagUi.press("Enter");
    expect(tagUi.popover()?.querySelector('[role="alert"]')?.textContent).toBe(
      "タグを登録できませんでした。接続を確認して、もう一度お試しください。",
    );
    expect(tagUi.of(1)).toBeNull();
  });

  it("登録の返事を待つ間に閉じても、タグは付き、フォーカスはタグのボタンに残る", async () => {
    await mount([{ content: "- a" }]);
    await tagUi.open(1);
    await tagUi.type("買い物");
    let reply!: () => void;
    tagGate = new Promise<void>((resolve) => (reply = resolve));
    await tagUi.press("Enter");
    await tagUi.press("Escape");
    expect(tagUi.popover()).toBeNull();
    expect(document.activeElement).toBe(tagUi.button(1));
    await act(async () => {
      reply();
      await new Promise((r) => setTimeout(r, 0));
    });
    // タグが付いてボタンが札に変わっても、同じボタンにフォーカスがある
    expect(tagUi.of(1)).toBe("買い物");
    expect(document.activeElement).toBe(tagUi.button(1));
  });

  it("付いているタグは入力欄の前に出て、× か空の入力欄での Backspace で外せる (登録は残る)", async () => {
    register("買い物");
    await mount([
      { content: "- a", tagId: idOf("買い物") },
      { content: "- b", tagId: idOf("買い物") },
    ]);
    await tagUi.open(1);
    expect(tagUi.rows()).toEqual([["買い物", true]]);
    await click(
      tagUi
        .popover()!
        .querySelector<HTMLButtonElement>('button[aria-label="タグ「買い物」を外す"]')!,
    );
    expect(tagUi.of(1)).toBeNull();
    expect(document.activeElement).toBe(tagUi.input());
    await tagUi.press("Escape");
    await tagUi.open(2);
    await tagUi.press("Backspace");
    expect(tagUi.of(2)).toBeNull();
    await waitForSave();
    expect(tagPuts.at(-1)).toEqual([null, null]);
    expect(registeredNames()).toEqual(["買い物"]);
  });

  it("「…」で名前を変えると、付けていたセクションのタグも変わる", async () => {
    register("買い物", "家");
    await mount([
      { content: "- a", tagId: idOf("買い物") },
      { content: "- b", tagId: idOf("家") },
    ]);
    await tagUi.open(2);
    await tagUi.edit("買い物");
    const input = tagUi.renameInput("買い物");
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("買い物");
    await tagUi.type("#買う物", input);
    await tagUi.press("Enter", input);
    expect(registeredNames()).toEqual(["買う物", "家"]);
    expect(tagUi.popover()?.querySelector('input[aria-label$="の新しい名前"]')).toBeNull();
    expect(document.activeElement).toBe(tagUi.input());
    await tagUi.press("Escape");
    expect([tagUi.of(1), tagUi.of(2)]).toEqual(["買う物", "家"]);
    // セクションは同じタグ (id) を指したままなので、保存し直すものは無い
    await waitForSave();
    expect(puts).toEqual([]);
    expect(serverTags()).toEqual(["買う物", "家"]);
  });

  it("保存前の書きかけがあるセクションのタグの名前を変えても、新しい名前で保存し、保存を繰り返さない", async () => {
    register("買い物");
    await mount([{ content: "- a", tagId: idOf("買い物") }]);
    await act(async () => {
      container.querySelector<HTMLElement>('div[aria-label^="セクション 1"]')!.click();
    });
    await type("b");
    await tagUi.open(1);
    await tagUi.edit("買い物");
    const input = tagUi.renameInput("買い物");
    await tagUi.type("買うもの", input);
    await tagUi.press("Enter", input);
    await tagUi.press("Escape");
    await waitForSave();
    expect(server.sections.map((s) => [s.content, nameOf(s.tagId)])).toEqual([
      ["- ab", "買うもの"],
    ]);
    expect(tagUi.of(1)).toBe("買うもの");
    const saves = puts.length;
    await waitForSave();
    expect(puts).toHaveLength(saves);
  });

  it("消したばかりのセクションのタグの名前を変えても、そのセクションは戻ってこず、「元に戻す」では新しい名前で戻る", async () => {
    register("買い物");
    await mount([
      { content: "- a", tagId: idOf("買い物") },
      { content: "- b", tagId: idOf("買い物") },
    ]);
    await act(async () => {
      container.querySelector<HTMLElement>("[aria-label='セクション 2 を削除']")!.click();
    });
    await tagUi.open(1);
    await tagUi.edit("買い物");
    const input = tagUi.renameInput("買い物");
    await tagUi.type("買うもの", input);
    await tagUi.press("Enter", input);
    await tagUi.press("Escape");
    expect(sectionTexts()).toEqual(["a"]);
    await act(async () => undoButton()!.click());
    // 戻したセクションは編集中 (エディタ) で戻る
    expect(sectionTexts()).toEqual(["a", "- b"]);
    expect([tagUi.of(1), tagUi.of(2)]).toEqual(["買うもの", "買うもの"]);
    await waitForSave();
    expect(server.sections.map((s) => [s.content, nameOf(s.tagId)])).toEqual([
      ["- a", "買うもの"],
      ["- b", "買うもの"],
    ]);
  });

  it("別の端末で登録したタグは、タブに戻ってきて取り直したときに絞り込みにも出る", async () => {
    register("買い物");
    await mount([{ content: "- a", tagId: idOf("買い物") }]);
    register("買い物", "家");
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(filterLabels()).toEqual(["すべて", "タグなし", "買い物", "家"]);
  });

  it("名前を変える前に取りに行った板の返事が後から届いても、タグの一覧を古い名前に戻さない", async () => {
    register("仕事");
    await mount([{ content: "- a", tagId: idOf("仕事") }]);
    let reply!: () => void;
    boardGetGate = new Promise<void>((resolve) => (reply = resolve));
    // タブに戻って取り直し始める (返事はまだ)
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await tagUi.open(1);
    await tagUi.edit("仕事");
    const input = tagUi.renameInput("仕事");
    await tagUi.type("作業", input);
    await tagUi.press("Enter", input);
    await tagUi.press("Escape");
    await act(async () => {
      reply();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(filterLabels()).toEqual(["すべて", "タグなし", "作業"]);
  });

  it("登録の返事を待つ間に別のタグの名前を変えたら、後から届いた登録の返事で古い名前に戻さない", async () => {
    register("仕事");
    await mount([{ content: "- a", tagId: idOf("仕事") }, { content: "- b" }]);
    await tagUi.open(2);
    await tagUi.type("旅行");
    let reply!: () => void;
    tagGate = new Promise<void>((resolve) => (reply = resolve));
    await tagUi.press("Enter");
    await tagUi.press("Escape");
    await tagUi.open(1);
    await tagUi.edit("仕事");
    const input = tagUi.renameInput("仕事");
    await tagUi.type("作業", input);
    await tagUi.press("Enter", input);
    await tagUi.press("Escape");
    await act(async () => {
      reply();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(filterLabels()).toEqual(["すべて", "タグなし", "作業", "旅行"]);
  });

  it("登録を待つ間に別のタグの登録を消しても、後から書かれた登録のタグは一覧に残る", async () => {
    register("家");
    await mount([{ content: "- a", tagId: idOf("家") }, { content: "- b" }]);
    tagCommitsLate = true;
    let reply!: () => void;
    tagGate = new Promise<void>((resolve) => (reply = resolve));
    await tagUi.open(2);
    await tagUi.type("旅行");
    await tagUi.press("Enter");
    await tagUi.press("Escape");
    await tagUi.open(1);
    await tagUi.edit("家");
    await act(async () => tagUi.buttonText("削除").click());
    await act(async () => tagUi.buttonText("削除する").click());
    await tagUi.press("Escape");
    await act(async () => {
      reply();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(filterLabels()).toEqual(["すべて", "タグなし", "旅行"]);
    expect(tagUi.of(2)).toBe("旅行");
  });

  it("登録に無いタグ (別の場所で登録を消された) の付いたセクションはタグなしとして見せ、保存したらサーバが外したとおり画面からも外し、保存を繰り返さない", async () => {
    // 別の場所で登録を消されたタグの id が、この画面のセクションに残っている
    await mount([{ content: "- a", tagId: "tag-gone" }]);
    expect(tagUi.of(1)).toBeNull();
    await act(async () => {
      container.querySelector<HTMLElement>('div[aria-label^="セクション 1"]')!.click();
    });
    await type("b");
    await waitForSave();
    expect(serverTags()).toEqual([null]);
    expect(tagUi.of(1)).toBeNull();
    const saves = puts.length;
    await waitForSave();
    expect(puts).toHaveLength(saves);
  });

  it("もうある名前に変えようとしたら理由を出し、Esc でやめると名前もタグも変えない", async () => {
    register("買い物", "家");
    await mount([{ content: "- a", tagId: idOf("買い物") }]);
    await tagUi.open(1);
    await tagUi.edit("買い物");
    const input = tagUi.renameInput("買い物");
    await tagUi.type("家", input);
    await tagUi.press("Enter", input);
    expect(tagUi.popover()?.querySelector('[role="alert"]')?.textContent).toBe(
      "「家」というタグはもうあります。別の名前にしてください。",
    );
    await tagUi.press("Escape", input);
    expect(tagUi.popover()?.querySelector('input[aria-label$="の新しい名前"]')).toBeNull();
    expect(registeredNames()).toEqual(["買い物", "家"]);
    await tagUi.press("Escape");
    expect(tagUi.of(1)).toBe("買い物");
  });

  it("「…」から削除するときは確かめ、消すと一覧からも、付けていたセクションからも外れる", async () => {
    register("買い物", "家");
    await mount([
      { content: "- a", tagId: idOf("買い物") },
      { content: "- b", tagId: idOf("家") },
      { content: "- c", tagId: idOf("買い物") },
    ]);
    await tagUi.open(2);
    await tagUi.edit("買い物");
    await click(tagUi.buttonText("削除"));
    // 確かめている間は、まだ消えていない
    expect(registeredNames()).toEqual(["買い物", "家"]);
    await click(tagUi.buttonText("キャンセル"));
    await click(tagUi.buttonText("削除"));
    await click(tagUi.buttonText("削除する"));
    expect(registeredNames()).toEqual(["家"]);
    expect(tagUi.rows()).toEqual([["家", true]]);
    await tagUi.press("Escape");
    expect([tagUi.of(1), tagUi.of(2), tagUi.of(3)]).toEqual([null, "家", null]);
    // サーバは付けていたセクションから外している。その後に保存しても、消したタグは付け直さない
    expect(serverTags()).toEqual([null, "家", null]);
    await act(async () => {
      container.querySelector<HTMLElement>('div[aria-label^="セクション 1"]')!.click();
    });
    await type("!");
    await waitForSave();
    expect(serverTags()).toEqual([null, "家", null]);
    expect([tagUi.of(1), tagUi.of(2), tagUi.of(3)]).toEqual([null, "家", null]);
  });

  it("ポップオーバーの中のボタンや余白を押しても、入力欄からフォーカスを外さない (押してもフォーカスの移らないブラウザで、押す前に閉じないように)", async () => {
    register("買い物");
    await mount([{ content: "- a", tagId: idOf("買い物") }]);
    await tagUi.open(1);
    const press = (el: Element) => {
      const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      el.dispatchEvent(down);
      return down.defaultPrevented;
    };
    expect(press(tagUi.buttonText("買い物"))).toBe(true);
    expect(press(tagUi.popover()!)).toBe(true);
    // 一覧の余白も (スクロールバーをつかむときだけ押したとおりにする。jsdom には大きさが無いので、ここは余白の扱い)
    expect(press(tagUi.popover()!.querySelector("ul")!)).toBe(true);
    // 入力欄は押したとおり (カーソルを置く)
    expect(press(tagUi.input())).toBe(false);
  });

  it("タグのボタンをもう一度押して閉じたら、フォーカスはそのボタンに残る", async () => {
    register("買い物");
    await mount([{ content: "- a" }]);
    await tagUi.open(1);
    // ブラウザと同じく、ウィンドウにフォーカスがある (jsdom はフォーカスを移している途中の blur で false を返す)
    const hasFocus = document.hasFocus;
    document.hasFocus = () => true;
    try {
      await tagUi.open(1);
    } finally {
      document.hasFocus = hasFocus;
    }
    expect(tagUi.popover()).toBeNull();
    expect(document.activeElement).toBe(tagUi.button(1));
  });

  it("打った名前と同じ名前のタグがあれば、それを Enter で付ける (名前を含む先に登録したタグより先に)", async () => {
    register("買い物リスト", "買い物");
    await mount([{ content: "- a" }]);
    await tagUi.open(1);
    await tagUi.type("買い物");
    expect(tagUi.rows().map(([name]) => name)).toEqual(["買い物", "買い物リスト"]);
    await tagUi.press("Enter");
    expect(tagUi.of(1)).toBe("買い物");
  });

  it("削除を確かめているところでキャンセルしたら、名前の入力欄へフォーカスを戻す", async () => {
    register("買い物");
    await mount([{ content: "- a" }]);
    await tagUi.open(1);
    await tagUi.edit("買い物");
    await act(async () => tagUi.buttonText("削除").click());
    await act(async () => tagUi.buttonText("キャンセル").click());
    expect(document.activeElement).toBe(tagUi.renameInput("買い物"));
  });

  it("日本語の変換中の Esc は変換の取り消しだけで、ポップオーバーを閉じない", async () => {
    register("買い物");
    await mount([{ content: "- a" }]);
    await tagUi.open(1);
    await act(async () => {
      tagUi.input().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
          isComposing: true,
        }),
      );
    });
    expect(tagUi.popover()).not.toBeNull();
  });

  it("Esc で閉じ、タグのボタンへフォーカスを戻す", async () => {
    register("買い物");
    await mount([{ content: "- a" }]);
    await tagUi.open(1);
    await tagUi.press("Escape");
    expect(tagUi.popover()).toBeNull();
    expect(document.activeElement).toBe(tagUi.button(1));
  });

  it("空のセクションには、タグのボタンを出さない", async () => {
    await mount([{ content: "- a" }, { content: "" }]);
    expect(container.querySelectorAll('button[aria-label*="のタグを選ぶ"]')).toHaveLength(1);
  });
});

describe("Board: 別の端末でのタグの変更", () => {
  /** n 番目のセクションの編集に入り、末尾に text を書き足す */
  async function append(n: number, text: string) {
    await act(async () => {
      container.querySelector<HTMLElement>(`div[aria-label^="セクション ${n}"]`)!.click();
    });
    await act(async () =>
      editor().dispatch({ selection: EditorSelection.cursor(editor().state.doc.length) }),
    );
    await type(text);
  }
  const remove = (n: number) =>
    act(async () => {
      container.querySelector<HTMLElement>(`[aria-label='セクション ${n} を削除']`)!.click();
    });
  /** 別の端末が板を保存した (板の版が進む。並びと内容は今のサーバのまま、最初のセクションだけ書き換える) */
  function savedElsewhere() {
    server = {
      revision: `${server.revision}-elsewhere`,
      sections: server.sections.map((s, i) =>
        i === 0 ? { ...s, content: `${s.content} (別の端末)` } : s,
      ),
    };
  }
  /** タブに戻ってきた (板を取り直す) */
  const refocus = () =>
    act(async () => {
      window.dispatchEvent(new Event("focus"));
      await new Promise((r) => setTimeout(r, 0));
    });

  it("保存前の書きかけがあるセクションのタグの名前を別の端末で変えても、タグは付いたまま保存し、戻ってきたら新しい名前で出る", async () => {
    register("買い物");
    await mount([{ content: "- a", tagId: idOf("買い物") }]);
    await append(1, "b");
    renameOnServer(idOf("買い物"), "買うもの");
    await waitForSave();
    expect(server.sections.map((s) => [s.content, nameOf(s.tagId)])).toEqual([
      ["- ab", "買うもの"],
    ]);
    await refocus();
    expect(tagUi.of(1)).toBe("買うもの");
  });

  it("保存前に消したセクションのタグの名前を別の端末で変えても、そのセクションは戻ってこない", async () => {
    register("買い物");
    await mount([
      { content: "- a", tagId: idOf("買い物") },
      { content: "- b", tagId: idOf("買い物") },
    ]);
    await remove(2);
    renameOnServer(idOf("買い物"), "買うもの");
    savedElsewhere();
    // 1 回目は版の違いで断られ、取り直して重ねてから保存し直す
    await waitForSave();
    await waitForSave();
    expect(sectionTexts()).toEqual(["a (別の端末)"]);
    expect(server.sections.map((s) => s.content)).toEqual(["- a (別の端末)"]);
  });

  it("保存前に消したセクションのタグの登録を別の端末で消しても、そのセクションは戻ってこない", async () => {
    register("買い物", "家");
    await mount([
      { content: "- a", tagId: idOf("家") },
      { content: "- b", tagId: idOf("買い物") },
      { content: "- c" },
    ]);
    await remove(2);
    unregisterOnServer(idOf("買い物"));
    await waitForSave();
    expect(server.sections.map((s) => s.content)).toEqual(["- a", "- c"]);
  });

  it("別の端末がタグの登録を消し、板も保存していても、保存前に消したセクションは戻ってこない", async () => {
    register("買い物", "家");
    await mount([
      { content: "- a", tagId: idOf("家") },
      { content: "- b", tagId: idOf("買い物") },
      { content: "- c" },
    ]);
    await remove(2);
    unregisterOnServer(idOf("買い物"));
    savedElsewhere();
    await waitForSave();
    await waitForSave();
    expect(server.sections.map((s) => s.content)).toEqual(["- a (別の端末)", "- c"]);
    expect(sectionTexts()).toEqual(["a (別の端末)", "c"]);
  });

  it("保存前の書きかけがあるセクションのタグの登録を別の端末で消したら、書いた内容はタグなしで保存する", async () => {
    register("買い物");
    await mount([{ content: "- a", tagId: idOf("買い物") }]);
    await append(1, "b");
    unregisterOnServer(idOf("買い物"));
    await waitForSave();
    expect(server.sections.map((s) => [s.content, s.tagId])).toEqual([["- ab", null]]);
    expect(tagUi.of(1)).toBeNull();
  });

  it("取り直しの返事を待つ間に作って付けたタグは、その返事 (作る前の板) を取り込んでも外れない", async () => {
    register("家");
    await mount([{ content: "- a" }, { content: "- b" }]);
    savedElsewhere();
    let reply!: () => void;
    boardGetGate = new Promise<void>((resolve) => (reply = resolve));
    // タブに戻って取り直し始める (返事は「旅行」を作る前の板)
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await tagUi.open(2);
    await tagUi.type("旅行");
    await tagUi.press("Enter");
    expect(tagUi.of(2)).toBe("旅行");
    await act(async () => {
      reply();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(tagUi.of(2)).toBe("旅行");
    await waitForSave();
    expect(serverTags()).toEqual([null, "旅行"]);
  });

  it("タグを選ぶ欄を開いている間に取り直した一覧も、開いたままの欄に出る", async () => {
    register("買い物");
    await mount([{ content: "- a" }]);
    await tagUi.open(1);
    register("家");
    await refocus();
    expect(tagUi.rows()).toEqual([
      ["買い物", false],
      ["家", false],
    ]);
  });
});

describe("Board: タグでの絞り込み", () => {
  const filterButton = (text: string) => {
    const el = [
      ...container.querySelectorAll<HTMLButtonElement>('[aria-label="タグで絞り込む"] button'),
    ].find((b) => b.textContent === text);
    if (!el) throw new Error(`絞り込みに「${text}」がありません`);
    return el;
  };
  const filterBy = (text: string) => act(async () => filterButton(text).click());
  /** 画面に出ているセクションの文字 (編集中ならエディタの内容) */
  const shown = () =>
    [...container.querySelectorAll<HTMLElement>("[data-section]")].map((box) => {
      const editing = box.querySelector<HTMLElement>(".cm-editor");
      if (editing) return EditorView.findFromDOM(editing)!.state.doc.toString();
      return box
        .querySelector('div[aria-label^="セクション "][aria-label$=")"]')
        ?.textContent?.trim();
    });

  it("「すべて」「タグなし」を先頭に並べ、その後ろに登録した順のタグを並べる", async () => {
    register("買い物", "家");
    await mount([{ content: "- a" }]);
    expect(filterLabels()).toEqual(["すべて", "タグなし", "買い物", "家"]);
  });

  it("タグが 1 つも無ければ、絞り込みは出さない", async () => {
    await mount([{ content: "- a" }]);
    expect(container.querySelector('[aria-label="タグで絞り込む"]')).toBeNull();
  });

  it("選んだタグの付いたセクションだけを出し、「タグなし」はタグの無いものだけ、「すべて」で戻る", async () => {
    register("買い物", "家");
    await mount([
      { content: "- 牛乳", tagId: idOf("買い物") },
      { content: "- メモ" },
      { content: "- 掃除", tagId: idOf("家") },
      { content: "- 卵", tagId: idOf("買い物") },
    ]);
    expect(shown()).toEqual(["牛乳", "メモ", "掃除", "卵"]);
    await filterBy("買い物");
    expect(shown()).toEqual(["牛乳", "卵"]);
    expect(filterButton("買い物").getAttribute("aria-pressed")).toBe("true");
    await filterBy("タグなし");
    expect(shown()).toEqual(["メモ"]);
    await filterBy("すべて");
    expect(shown()).toEqual(["牛乳", "メモ", "掃除", "卵"]);
    // 絞り込んでも板の内容は変えていないので、保存はしない
    await waitForSave();
    expect(puts).toEqual([]);
  });

  it("タグで絞り込んでいる間に足したセクションには、そのタグが付く", async () => {
    register("買い物");
    await mount([{ content: "- 牛乳", tagId: idOf("買い物") }, { content: "- メモ" }]);
    await filterBy("買い物");
    await addSection();
    await type("- 卵");
    expect(shown()).toEqual(["牛乳", "- 卵"]);
    await waitForSave();
    expect(tagPuts.at(-1)).toEqual(["買い物", null, "買い物"]);
  });

  it("当てはまるセクションが無ければ、そう伝える", async () => {
    register("買い物", "家");
    await mount([{ content: "- 牛乳", tagId: idOf("買い物") }]);
    await filterBy("家");
    expect(shown()).toEqual([]);
    expect(container.textContent).toContain("「家」のメモはまだありません。");
  });

  it("絞り込んでいるタグの名前を変えたら、新しい名前で絞り込んだまま", async () => {
    register("買い物", "家");
    await mount([
      { content: "- 牛乳", tagId: idOf("買い物") },
      { content: "- 掃除", tagId: idOf("家") },
    ]);
    await filterBy("買い物");
    await tagUi.open(1);
    await tagUi.edit("買い物");
    const input = tagUi.renameInput("買い物");
    await tagUi.type("買う物", input);
    await tagUi.press("Enter", input);
    expect(filterButton("買う物").getAttribute("aria-pressed")).toBe("true");
    expect(shown()).toEqual(["牛乳"]);
    // 名前を変えている間もセクションは隠れないので、開いていたポップオーバーもそのまま
    expect(document.activeElement).toBe(tagUi.input());
  });

  it("絞り込みに当てはまらないタグに付け替えたら、そのセクションは隠れ、フォーカスは次のセクションへ移る", async () => {
    register("買い物", "家");
    await mount([{ content: "- 牛乳" }, { content: "- 掃除" }]);
    await filterBy("タグなし");
    await tagUi.open(1);
    await act(async () => tagUi.buttonText("家").click());
    expect(shown()).toEqual(["掃除"]);
    // 読み上げの番号は、画面に出ている中での順番
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^セクション 1 /);
    expect(document.activeElement?.textContent).toContain("掃除");
  });

  it("「タグなし」で絞り込んでいる間に新しく作ったタグを付けたら、そのセクションは隠れ、フォーカスは次のセクションへ移る", async () => {
    register("家");
    await mount([{ content: "- 牛乳" }, { content: "- 掃除" }]);
    await filterBy("タグなし");
    await tagUi.open(1);
    await tagUi.type("買い物");
    await tagUi.press("Enter");
    expect(shown()).toEqual(["掃除"]);
    expect(document.activeElement?.textContent).toContain("掃除");
  });

  it("絞り込みに当てはまるただ 1 つのセクションを付け替えて隠したら、フォーカスは選んでいる絞り込みのボタンへ移る", async () => {
    register("買い物", "家");
    await mount([{ content: "- 牛乳", tagId: idOf("買い物") }, { content: "- 掃除" }]);
    await filterBy("買い物");
    await tagUi.open(1);
    await act(async () => tagUi.buttonText("家").click());
    expect(shown()).toEqual([]);
    expect(document.activeElement).toBe(filterButton("買い物"));
  });

  it("絞り込みに当てはまるただ 1 つのセクションをマウスで消したときも、フォーカスは選んでいる絞り込みのボタンへ移る", async () => {
    register("買い物");
    await mount([{ content: "- 牛乳", tagId: idOf("買い物") }, { content: "- メモ" }]);
    await filterBy("買い物");
    const button = container.querySelector<HTMLElement>("[aria-label='セクション 1 を削除']")!;
    button.focus();
    // マウスで押した (detail が 1。0 はキーボードで押したことになり、「元に戻す」へ移る)
    await act(async () =>
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })),
    );
    expect(shown()).toEqual([]);
    expect(document.activeElement).toBe(filterButton("買い物"));
  });

  it("絞り込んでいる間の読み上げの名前は、画面に出ている中での番号にする", async () => {
    register("買い物");
    await mount([
      { content: "- メモ" },
      { content: "- 牛乳", tagId: idOf("買い物") },
      { content: "- 掃除" },
      { content: "- 卵", tagId: idOf("買い物") },
    ]);
    await filterBy("買い物");
    const names = [
      ...container.querySelectorAll(
        '[data-section] [aria-label^="セクション "][aria-label$="を削除"]',
      ),
    ].map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["セクション 1 を削除", "セクション 2 を削除"]);
  });

  it("消した後に絞り込みを変えてから「元に戻す」を押したら、「すべて」に戻して見せる", async () => {
    register("買い物");
    await mount([{ content: "- 牛乳", tagId: idOf("買い物") }, { content: "- メモ" }]);
    await act(async () => {
      container.querySelector<HTMLElement>("[aria-label='セクション 2 を削除']")!.click();
    });
    await filterBy("買い物");
    await act(async () => undoButton()!.click());
    expect(filterButton("すべて").getAttribute("aria-pressed")).toBe("true");
    expect(shown()).toEqual(["牛乳", "- メモ"]);
  });

  it("タグで絞り込んでいる間に作った書く場所は、「すべて」に戻すとタグが外れ、そこに書いたメモにタグは付かない", async () => {
    register("買い物");
    await mount([{ content: "- 牛乳", tagId: idOf("買い物") }]);
    await filterBy("買い物");
    await addSection();
    await filterBy("すべて");
    await addSection();
    await type("- 別のこと");
    await waitForSave();
    expect(tagPuts.at(-1)).toEqual(["買い物", null]);
  });

  it("書く場所が残っていても、メモの無いタグで絞り込めば「まだありません」と伝える", async () => {
    register("買い物", "家");
    await mount([{ content: "- 牛乳", tagId: idOf("買い物") }]);
    await addSection();
    await filterBy("家");
    expect(shown()).toEqual([]);
    expect(container.textContent).toContain("「家」のメモはまだありません。");
  });

  it("絞り込んでいたタグの登録を消してから同じ名前でまた作っても、その絞り込みは勝手に戻らない", async () => {
    register("買い物", "家");
    await mount([
      { content: "- 牛乳", tagId: idOf("買い物") },
      { content: "- 掃除", tagId: idOf("家") },
    ]);
    await filterBy("買い物");
    await tagUi.open(1);
    await tagUi.edit("買い物");
    await act(async () => tagUi.buttonText("削除").click());
    await act(async () => tagUi.buttonText("削除する").click());
    await tagUi.type("買い物");
    await tagUi.press("Enter");
    expect(filterButton("すべて").getAttribute("aria-pressed")).toBe("true");
    expect(shown()).toEqual(["牛乳", "掃除"]);
  });

  it("登録の返事を待つ間に別のセクションを書き始めたら、返事で付いたタグが絞り込みから外れても、書いている場所は動かさない", async () => {
    register("家");
    await mount([{ content: "- 牛乳" }, { content: "- 掃除" }]);
    await filterBy("タグなし");
    await tagUi.open(1);
    await tagUi.type("買い物");
    let reply!: () => void;
    tagGate = new Promise<void>((resolve) => (reply = resolve));
    await tagUi.press("Enter");
    await tagUi.press("Escape");
    await act(async () => {
      container.querySelector<HTMLElement>('div[aria-label^="セクション 2"]')!.click();
    });
    // 行の途中 (「- 」の後ろ) に書き足している
    await act(async () => editor().dispatch({ selection: EditorSelection.cursor(2) }));
    await type("床の");
    await act(async () => {
      reply();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(shown()).toEqual(["- 床の掃除"]);
    expect(editor().hasFocus).toBe(true);
    expect(editor().state.selection.main.head).toBe("- 床の".length);
  });

  it("同じタブで別のアカウントに切り替えたら、前のアカウントで選んだ絞り込みでは開かない", async () => {
    register("仕事");
    await mount([{ content: "- a", tagId: idOf("仕事") }, { content: "- b" }]);
    await filterBy("仕事");
    await act(async () => root.unmount());
    container.remove();
    await mount([{ content: "- c", tagId: idOf("仕事") }, { content: "- d" }], "v");
    expect(filterButton("すべて").getAttribute("aria-pressed")).toBe("true");
    expect(shown()).toEqual(["c", "d"]);
  });

  it("重なったタグの変更で途中の古い一覧が届いても、選んでいた絞り込みを消さない", async () => {
    register("仕事");
    await mount([{ content: "- a" }]);
    await filterBy("仕事");
    // 登録はすぐに書かれるが、返事 (書いた時点の一覧) は名前の変更の返事より後に届く
    let reply!: () => void;
    tagGate = new Promise<void>((resolve) => (reply = resolve));
    await filterBy("すべて");
    await tagUi.open(1);
    await tagUi.type("旅行");
    await tagUi.press("Enter");
    await tagUi.press("Escape");
    await filterBy("仕事");
    await addSection();
    await type("- b");
    // 絞り込みで出ているのは足したセクションだけ
    await tagUi.open(1);
    await tagUi.edit("仕事");
    const input = tagUi.renameInput("仕事");
    await tagUi.type("作業", input);
    await tagUi.press("Enter", input);
    // そのセクションからタグを外す (「作業」のメモは無くなり、選択肢に残るのは登録の一覧から)
    await tagUi.press("Backspace");
    // 登録の返事 (名前を変える前の一覧) が届き、一覧を取り直している間
    let listed!: () => void;
    tagListGate = new Promise<void>((resolve) => (listed = resolve));
    await act(async () => {
      reply();
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      listed();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(filterLabels()).toEqual(["すべて", "タグなし", "作業", "旅行"]);
    expect(filterButton("作業").getAttribute("aria-pressed")).toBe("true");
  });

  it("絞り込んでいるタグの登録を消したら、「すべて」に戻る", async () => {
    register("買い物", "家");
    await mount([
      { content: "- 牛乳", tagId: idOf("買い物") },
      { content: "- 掃除", tagId: idOf("家") },
    ]);
    await filterBy("買い物");
    await tagUi.open(1);
    await tagUi.edit("買い物");
    await act(async () => tagUi.buttonText("削除").click());
    await act(async () => tagUi.buttonText("削除する").click());
    expect(filterButton("すべて").getAttribute("aria-pressed")).toBe("true");
    expect(shown()).toEqual(["牛乳", "掃除"]);
  });
});

describe("Board: 書式のツールバー", () => {
  const toolbar = () => container.querySelector<HTMLElement>('[role="toolbar"]');
  const tool = (label: string) =>
    toolbar()!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

  it("編集中のセクションの下にだけ出し、ボタンで行の書式を変えて保存する。Esc で編集を終えると消える", async () => {
    await mount([{ content: "牛乳" }, { content: "卵" }]);
    expect(toolbar()).toBeNull();
    await act(async () => {
      container.querySelector<HTMLElement>('div[aria-label^="セクション 1"]')!.click();
    });
    expect(toolbar()?.getAttribute("aria-label")).toBe("セクション 1 の書式");
    await act(async () => tool("箇条書き").click());
    expect(editor().state.doc.toString()).toBe("- 牛乳");
    await act(async () => tool("H1 見出し").click());
    expect(editor().state.doc.toString()).toBe("# 牛乳");
    await act(async () => tool("元に戻す").click());
    expect(editor().state.doc.toString()).toBe("- 牛乳");
    await waitForSave();
    expect(puts.at(-1)).toEqual([
      { id: "id-0", content: "- 牛乳" },
      { id: "id-1", content: "卵" },
    ]);
    await key("Escape");
    expect(toolbar()).toBeNull();
  });
});

describe("Board: リンクの題名", () => {
  const links = () =>
    [...container.querySelectorAll<HTMLAnchorElement>("a[data-link-label]")].map((a) => [
      a.getAttribute("href"),
      a.textContent,
    ]);
  const settle = () => act(async () => await new Promise((r) => setTimeout(r, 0)));

  it("URL のリンクの文字を、行き先のページの題名に置き換える (取れなかったものは縮めた URL のまま)", async () => {
    previews = { "https://example.com/a": { title: "記事 A", siteName: "Example" } };
    await mount([{ content: "- https://example.com/a\n- https://www.example.org/b\n- 文字だけ" }]);
    await settle();
    expect(links()).toEqual([
      ["https://example.com/a", "記事 A"],
      ["https://www.example.org/b", "example.org/b"],
    ]);
  });

  it("同じ URL は 1 回だけ取りに行く", async () => {
    const url = "https://example.com/a";
    previews = { [url]: { title: "記事 A", siteName: null } };
    await mount([{ content: `${url}\n${url}` }, { content: url }]);
    await settle();
    expect(links().map(([, text]) => text)).toEqual(["記事 A", "記事 A", "記事 A"]);
    expect(previewRequests).toEqual([url]);
  });

  it("取れなかった URL は、表示と編集を行き来して描き直しても、すぐには取りに行き直さない", async () => {
    const url = "https://example.com/a";
    previewRefused = true;
    await mount([{ content: url }]);
    await settle();
    await act(async () => {
      container.querySelector<HTMLElement>('div[aria-label^="セクション 1"]')!.click();
    });
    await key("Escape");
    await settle();
    expect(links()).toEqual([[url, "example.com/a"]]);
    expect(previewRequests).toEqual([url]);
  });

  it("編集している間は URL のまま見せ、編集を終えると題名に戻る", async () => {
    previews = { "https://example.com/a": { title: "記事 A", siteName: null } };
    await mount([{ content: "https://example.com/a" }]);
    await settle();
    await act(async () => {
      container.querySelector<HTMLElement>('div[aria-label^="セクション 1"]')!.click();
    });
    expect(editor().state.doc.toString()).toBe("https://example.com/a");
    expect(links()).toEqual([]);
    await key("Escape");
    expect(links()).toEqual([["https://example.com/a", "記事 A"]]);
  });
});

describe("Board: 期限切れのセクション (issue #74)", () => {
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
});

describe("Board: 画面の知らないうちにサーバで期限を過ぎたセクションの保存 (issue #94)", () => {
  it("サーバが期限切れとして作らなかったセクションは画面から外し、書き換えていたものは新しいセクションとして残す", async () => {
    await mount([{ content: "- a" }, { content: "- b" }, { content: "- c" }]);
    // 画面上の期限はまだ先だが、サーバでは a と b がもう期限切れ
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

describe("Board: 削除した後のフォーカス (issue #112)", () => {
  /** 削除ボタンを押す。detail 0 はキーボード (や支援技術) での click、1 はマウス / タップ */
  async function clickDelete(n: number, detail: 0 | 1) {
    const button = container.querySelector<HTMLElement>(`[aria-label='セクション ${n} を削除']`)!;
    await act(async () => {
      // キーボードで押すときは、先にボタンへフォーカスが来ている
      if (detail === 0) button.focus();
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail }));
    });
  }
  const focusedLabel = () => document.activeElement?.getAttribute("aria-label");

  it("キーボードで削除すると「元に戻す」にフォーカスが移り、× で閉じると削除した場所の次のセクションへ戻る", async () => {
    await mount([{ content: "- a" }, { content: "- b" }, { content: "- c" }]);
    await clickDelete(2, 0);
    expect(sectionTexts()).toEqual(["a", "c"]);
    expect(document.activeElement).toBe(undoButton());
    const close = document.querySelector<HTMLElement>(
      "[aria-label='「セクションを削除しました」を閉じる']",
    )!;
    await act(async () => close.click());
    expect(undoButton()).toBeUndefined();
    expect(focusedLabel()).toBe("セクション 2 (Enter で編集)");
    expect(document.activeElement?.textContent?.trim()).toBe("c");
  });

  it("「元に戻す」で Esc を押しても閉じ、最後のセクションを消したときは前のセクションへ戻る", async () => {
    await mount([{ content: "- a" }, { content: "- b" }]);
    await clickDelete(2, 0);
    await act(async () => {
      undoButton()!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(undoButton()).toBeUndefined();
    expect(focusedLabel()).toBe("セクション 1 (Enter で編集)");
  });

  it("キーボードで削除して「元に戻す」を押すと、戻したセクションの編集に入る", async () => {
    await mount([{ content: "- a" }, { content: "- b" }, { content: "- c" }]);
    await clickDelete(2, 0);
    await act(async () => undoButton()!.click());
    expect(sectionTexts()).toEqual(["a", "- b", "c"]);
    expect(editor().hasFocus).toBe(true);
  });

  it("編集中のセクションをマウスで削除すると、次のセクションの表示へフォーカスが移る", async () => {
    await mount([{ content: "- a" }, { content: "- b" }, { content: "- c" }]);
    await act(async () =>
      container.querySelector<HTMLElement>(`[aria-label^="セクション 2 ("]`)!.click(),
    );
    expect(editor().hasFocus).toBe(true);
    await clickDelete(2, 1);
    expect(sectionTexts()).toEqual(["a", "c"]);
    expect(focusedLabel()).toBe("セクション 2 (Enter で編集)");
    // マウスで押したときは「元に戻す」へは移さない
    expect(document.activeElement).not.toBe(undoButton());
  });

  it("別のセクションを編集しながらマウスで削除したときは、編集中のエディタにフォーカスを残す", async () => {
    await mount([{ content: "- a" }, { content: "- b" }, { content: "- c" }]);
    await act(async () =>
      container.querySelector<HTMLElement>(`[aria-label^="セクション 1 ("]`)!.click(),
    );
    await clickDelete(3, 1);
    expect(sectionTexts()).toEqual(["- a", "b"]);
    expect(editor().hasFocus).toBe(true);
  });
});

describe("Board: 保存できないとき (HAY-54)", () => {
  const OFFLINE_MESSAGE = "オフラインです。オンライン復帰後に再保存してください";
  /** ヘッダーの保存状態のうち、割り込んで読み上げる文言 (オフライン / 失敗のときだけ入る) */
  const saveAlert = () => container.querySelector('[role="alert"]')?.textContent;
  // 移動の前に出た確認の文言と、それへの答え
  const confirmations: string[] = [];
  let confirmAnswer = false;
  beforeEach(() => {
    confirmations.length = 0;
    confirmAnswer = false;
    window.confirm = (message?: string) => {
      confirmations.push(message ?? "");
      return confirmAnswer;
    };
  });

  /** 保存が済むまで待つ (偽のサーバはすぐ答えるので、少し待てば足りる) */
  const settle = () => act(async () => await new Promise((r) => setTimeout(r, 20)));
  async function goOnline() {
    onLine = true;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await settle();
  }
  async function navigateAway() {
    await act(async () => {
      await router.navigate({ to: "/docs/guide" });
    });
    await settle();
  }
  // 今いる場所 (URL)。WithRouter はルーターの文脈だけを渡すので、ブロッカーの確認を挟んで移った先は
  // router.state にはまだ反映されず、履歴のほうに出る
  const currentPath = () => router.history.location.pathname;
  const savedContents = () => server.sections.map((s) => s.content);

  it("端末がオフラインなら送らずに入力を残し、オンラインに戻ったら保存する", async () => {
    await mount([{ content: "- a" }]);
    onLine = false;
    await addSection();
    await type("- b");
    await waitForSave();
    expect(puts).toEqual([]);
    expect(saveAlert()).toBe(OFFLINE_MESSAGE);
    expect(sectionTexts()).toEqual(["a", "- b"]);

    await goOnline();
    expect(savedContents()).toEqual(["- a", "- b"]);
    expect(readCachedBoard("u")?.sections.map((s) => s.content)).toEqual(["- a", "- b"]);
    expect(saveAlert()).toBe("");
    expect(container.textContent).toContain("保存済み");
  });

  it("通信できずに保存できなかったらオフラインと出し、オンラインに戻ったら保存し直す", async () => {
    await mount([{ content: "- a" }]);
    putReply = "offline";
    await addSection();
    await type("- b");
    await waitForSave();
    expect(puts).toEqual([]);
    expect(saveAlert()).toBe(OFFLINE_MESSAGE);
    expect(sectionTexts()).toEqual(["a", "- b"]);

    putReply = "ok";
    await goOnline();
    expect(savedContents()).toEqual(["- a", "- b"]);
    expect(saveAlert()).toBe("");
  });

  it.for([500, 429] as const)(
    "サーバが断ったら (%i) 失敗と出して入力を残し、「保存を再試行」で保存し直す",
    async (status) => {
      await mount([{ content: "- a" }]);
      putReply = status;
      await addSection();
      await type("- b");
      await waitForSave();
      expect(puts).toEqual([]);
      expect(saveAlert()).toBe(`保存に失敗: 保存に失敗しました (${status})`);
      expect(sectionTexts()).toEqual(["a", "- b"]);
      // 失敗のまま放っておいても、勝手に送り直しはしない
      await waitForSave();
      expect(puts).toEqual([]);

      putReply = "ok";
      await act(async () =>
        container.querySelector<HTMLElement>("[aria-label='保存を再試行']")!.click(),
      );
      await settle();
      expect(savedContents()).toEqual(["- a", "- b"]);
      expect(saveAlert()).toBe("");
    },
  );

  it("保存に失敗したままでも、オンラインに戻ったら保存し直す", async () => {
    await mount([{ content: "- a" }]);
    putReply = 500;
    await addSection();
    await type("- b");
    await waitForSave();
    expect(saveAlert()).toMatch(/^保存に失敗/);

    putReply = "ok";
    await goOnline();
    expect(savedContents()).toEqual(["- a", "- b"]);
  });

  it("別の場所で足された分と合わせると文字数の上限を超えるなら送らず、上限を超えたと出す", async () => {
    // 手元の a に新しいセクションを足しても上限に収まるが、別の場所で足された x (100 文字) と合わせると超える
    const a = "x".repeat(BOARD_MAX_LENGTH - 3 - 3 - 100 - 10);
    await mount([{ content: a }]);
    server = {
      revision: "elsewhere",
      sections: [
        {
          id: "id-0",
          content: a,
          position: 0,
          createdAt: CREATED,
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
        {
          id: "x",
          content: "y".repeat(100),
          position: 1,
          createdAt: CREATED,
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      ],
    };
    await addSection();
    await type("- 123456789");
    // 1 回目は断られて取り直し、合わせた板で保存し直そうとする
    await waitForSave();
    await waitForSave();
    expect(puts).toEqual([]);
    expect(saveAlert()).toBe(
      `保存に失敗: 文字数が上限 (${BOARD_MAX_LENGTH.toLocaleString()}) を超えています`,
    );
    expect(sectionTexts()).toHaveLength(3);
  });

  it("オフラインで保存できていない間は、ページを移る前に確かめ、断れば留まる", async () => {
    await mount([{ content: "- a" }]);
    onLine = false;
    await addSection();
    await type("- b");
    await waitForSave();

    confirmAnswer = false;
    await navigateAway();
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0]).toMatch(/変更は失われます/);
    expect(currentPath()).toBe("/");
    expect(sectionTexts()).toEqual(["a", "- b"]);

    confirmAnswer = true;
    await navigateAway();
    expect(currentPath()).toBe("/docs/guide");
  });

  it("端末がオフラインになったら、自動保存の前でもページを移る前に確かめる", async () => {
    await mount([{ content: "- a" }]);
    await addSection();
    await type("- b");
    onLine = false;
    await navigateAway();
    expect(confirmations).toHaveLength(1);
    expect(currentPath()).toBe("/");
  });

  it("オンラインなら未保存の変更があってもページの移動を確かめない", async () => {
    await mount([{ content: "- a" }]);
    await addSection();
    await type("- b");
    await navigateAway();
    expect(confirmations).toEqual([]);
    expect(currentPath()).toBe("/docs/guide");
  });

  it("通信できずに保存できなかった後に書き足しても、保存できるまではページを移る前に確かめる", async () => {
    await mount([{ content: "- a" }]);
    putReply = "offline";
    await addSection();
    await type("- b");
    await waitForSave();
    expect(saveAlert()).toBe(OFFLINE_MESSAGE);
    // 自動保存を待たずに移ろうとする (離れるときの保存も届かない)
    await type("c");
    await navigateAway();
    expect(confirmations).toHaveLength(1);
    expect(currentPath()).toBe("/");
  });
});
