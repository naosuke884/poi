// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Tag } from "./data/tags";

// 板の登録済みのタグ (useBoardTags) を、/api/tags の偽物のサーバ (プロセスの外なので、ここだけ偽物にする) に対して確かめる。
// サーバは登録済みのタグを持ち、本物と同じく、登録はアイコンを選んでから (gate を待ってから) 書き、名前の変更と
// 削除はすぐ書く。返事は書いた時点の一覧で、gate を渡すとその返事をそこまで遅らせられる
const server = vi.hoisted(() => ({
  tags: [] as { id: string; name: string; icon: "home" }[],
  seq: 0,
  /** 次の要求 (の書き込みか返事) を待たせる */
  gate: null as Promise<void> | null,
}));
/** 次に届く要求を止めておき、それを進める関数を返す */
function holdNext(): () => Promise<void> {
  let release!: () => void;
  server.gate = new Promise<void>((resolve) => (release = resolve));
  return () =>
    act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 0));
    });
}
const takeGate = () => {
  const gate = server.gate ?? Promise.resolve();
  server.gate = null;
  return gate;
};
const reply = (tags: typeof server.tags) => ({ ok: true, json: async () => ({ tags }) });
vi.mock("@/lib/api", () => ({
  api: {
    tags: {
      $get: async () => {
        const gate = takeGate();
        const body = server.tags;
        await gate;
        return reply(body);
      },
      $post: async ({ json }: { json: { name: string } }) => {
        // アイコンを選ぶ間待ってから書く (本物と同じ)
        await takeGate();
        if (!server.tags.some((t) => t.name === json.name)) {
          server.tags = [...server.tags, { id: `t${++server.seq}`, name: json.name, icon: "home" }];
        }
        return reply(server.tags);
      },
      $patch: async ({ json }: { json: { id: string; name: string } }) => {
        const gate = takeGate();
        if (!server.tags.some((t) => t.id === json.id)) {
          return { ok: false, json: async () => ({ error: "TagNotFound" }) };
        }
        server.tags = server.tags.map((t) => (t.id === json.id ? { ...t, name: json.name } : t));
        const body = server.tags;
        await gate;
        return reply(body);
      },
      $delete: async ({ json }: { json: { id: string } }) => {
        const gate = takeGate();
        server.tags = server.tags.filter((t) => t.id !== json.id);
        const body = server.tags;
        await gate;
        return reply(body);
      },
    },
  },
}));

const { useBoardTags } = await import("./use-board-tags");
const { resetTagFilterForTest } = await import("./tag-filter");
const { readCachedBoard, writeCachedBoard } = await import("./data/board-cache");
const { writeCachedUser } = await import("@/lib/session-cache");

let hook: ReturnType<typeof useBoardTags>;
function Probe(props: { initial: Tag[]; userId: string; readOnly: boolean }) {
  hook = useBoardTags(props);
  return null;
}

let root: Root;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  resetTagFilterForTest();
  server.tags = [];
  server.seq = 0;
  server.gate = null;
  localStorage.clear();
  writeCachedUser({ id: "u", name: "U" });
});
afterEach(async () => {
  await act(async () => root.unmount());
});

/** サーバに names のタグを登録した状態で、その一覧から始める */
async function mount(names: string[] = [], { readOnly = false } = {}) {
  server.tags = names.map((name) => ({ id: `t${++server.seq}`, name, icon: "home" }));
  root = createRoot(document.createElement("div"));
  await act(async () =>
    root.render(<Probe initial={server.tags} userId="u" readOnly={readOnly} />),
  );
}
const names = () => hook.tags.map((t) => t.name);
const idOf = (name: string) => server.tags.find((t) => t.name === name)!.id;
/** 終わるのを待たずに始める (返事を待たせている間に別の操作をするため) */
const start = <T,>(run: () => Promise<T>) => {
  let done!: Promise<T>;
  act(() => {
    done = run();
  });
  return done;
};

describe("useBoardTags", () => {
  it("登録・名前の変更・削除の返事で一覧を変え、名前を変えても id は変わらない", async () => {
    await mount(["家"]);
    const home = idOf("家");
    await act(() => hook.register("買い物"));
    expect(names()).toEqual(["家", "買い物"]);
    await act(() => hook.rename(hook.byId.get(home)!, "住まい"));
    expect(hook.tags.map((t) => [t.id, t.name])).toEqual([
      [home, "住まい"],
      [idOf("買い物"), "買い物"],
    ]);
    await act(() => hook.unregister(home));
    expect(names()).toEqual(["買い物"]);
  });

  it("名前を変えようとしたタグが別の場所で消されていたら、断られた後に一覧を取り直す", async () => {
    await mount(["家", "仕事"]);
    const work = hook.byId.get(idOf("仕事"))!;
    server.tags = server.tags.filter((t) => t.name !== "仕事");
    let error: unknown;
    await act(async () => {
      await hook.rename(work, "作業").catch((e: unknown) => (error = e));
    });
    expect(error).toBeInstanceOf(Error);
    expect(names()).toEqual(["家"]);
  });

  it("手元でタグを変える前に取りに行った一覧が後から届いても、使わない", async () => {
    await mount(["仕事"]);
    const requestedAt = performance.now();
    const stale = [...server.tags];
    await act(() => hook.rename(hook.tags[0]!, "作業"));
    act(() => void hook.setFetched(stale, requestedAt));
    expect(names()).toEqual(["作業"]);
    // 変えた後に取りに行った一覧は使う (別の端末での登録)
    act(
      () =>
        void hook.setFetched(
          [...server.tags, { id: "x", name: "旅行", icon: "home" }],
          performance.now(),
        ),
    );
    expect(names()).toEqual(["作業", "旅行"]);
  });

  it("重なった変更の返事は届いた順に使い、全部の返事が届いたら一覧を取り直してサーバと同じにする", async () => {
    await mount(["家"]);
    // 登録はアイコンを選ぶ間待つ。その間に「家」の登録を消す (先に書かれるが、返事は遅れて届く)
    const commit = holdNext();
    const registering = start(() => hook.register("旅行"));
    const deleteReply = holdNext();
    const deleting = start(() => hook.unregister(idOf("家")));
    await commit();
    await registering;
    expect(names()).toEqual(["旅行"]);
    // 遅れて届いた削除の返事は、登録が書かれる前の一覧 (空)。それも使うが、取り直して戻す
    await deleteReply();
    await deleting;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(names()).toEqual(["旅行"]);
  });

  it("名前を変えても、そのタグで絞り込んだまま", async () => {
    await mount(["買い物"]);
    act(() => hook.setFilter({ kind: "tag", tagId: idOf("買い物") }));
    await act(() => hook.rename(hook.tags[0]!, "買うもの"));
    expect(hook.filter).toEqual({ kind: "tag", tagId: idOf("買うもの") });
  });

  it("絞り込んでいるタグの登録が消えたら「すべて」に戻し、同じ名前で作り直しても戻らない", async () => {
    await mount(["買い物", "家"]);
    act(() => hook.setFilter({ kind: "tag", tagId: idOf("買い物") }));
    await act(() => hook.unregister(idOf("買い物")));
    expect(hook.filter).toEqual({ kind: "all" });
    await act(() => hook.register("買い物"));
    expect(hook.filter).toEqual({ kind: "all" });
  });

  it("タグを全部消したら (絞り込みのバーが消える)、「タグなし」の絞り込みも「すべて」に戻す", async () => {
    await mount(["家"]);
    act(() => hook.setFilter({ kind: "untagged" }));
    await act(() => hook.unregister(idOf("家")));
    expect(hook.filter).toEqual({ kind: "all" });
    await act(() => hook.register("買い物"));
    expect(hook.filter).toEqual({ kind: "all" });
  });

  it("重なった変更の途中で、絞り込んでいるタグの無い古い一覧が届いても、絞り込みを消さない", async () => {
    await mount(["家"]);
    // 「旅行」の登録の返事が届いてそれで絞り込んだ後に、その登録より前の一覧 (名前の変更の返事) が遅れて届く
    const renameReply = holdNext();
    const renaming = start(() => hook.rename(hook.tags[0]!, "住まい"));
    await act(() => hook.register("旅行"));
    act(() => hook.setFilter({ kind: "tag", tagId: idOf("旅行") }));
    // 名前の変更は登録より前に書かれたので、その返事の一覧に「旅行」は無い。それが届いて一覧を取り直している間
    const listed = holdNext();
    await renameReply();
    await renaming;
    expect(names()).toEqual(["住まい"]);
    await listed();
    expect(names()).toEqual(["住まい", "旅行"]);
    expect(hook.filter).toEqual({ kind: "tag", tagId: idOf("旅行") });
  });

  it("オフラインの閲覧では、キャッシュの一覧に無いタグでの絞り込みも覚えておき、つながったら戻す", async () => {
    const home = { id: "t-home", name: "家", icon: "home" as const };
    const trip = { id: "t-trip", name: "旅行", icon: "home" as const };
    const open = async (initial: Tag[], readOnly: boolean) => {
      if (root) await act(async () => root.unmount());
      root = createRoot(document.createElement("div"));
      await act(async () =>
        root.render(<Probe initial={initial} userId="u" readOnly={readOnly} />),
      );
    };
    await open([home, trip], false);
    act(() => hook.setFilter({ kind: "tag", tagId: "t-trip" }));
    // キャッシュの一覧は「旅行」を登録する前のもの
    await open([home], true);
    expect(hook.filter).toEqual({ kind: "all" });
    await open([home, trip], false);
    expect(hook.filter).toEqual({ kind: "tag", tagId: "t-trip" });
  });

  it("取りに行った板に重ねるときは、その板の一覧に、取りに行った後にこの画面が知ったタグだけを足して登録済みとする", async () => {
    await mount(["家", "仕事"]);
    const work = idOf("仕事");
    const requestedAt = performance.now();
    // 取りに行った板の一覧: 「仕事」はその前に別の場所で消された。その後にこの画面で「旅行」を作った
    const snapshot = server.tags.filter((t) => t.id !== work);
    await act(() => hook.register("旅行"));
    expect([...hook.registeredAsOf(snapshot, requestedAt)].sort()).toEqual(
      [idOf("家"), idOf("旅行")].sort(),
    );
  });

  it("登録に無い id のタグ (別の場所で登録を消された) の付いたセクションは、タグなしとして絞り込む", async () => {
    await mount(["家"]);
    act(() => hook.setFilter({ kind: "untagged" }));
    expect(hook.isShown({ tagId: "gone" })).toBe(true);
    expect(hook.isShown({ tagId: idOf("家") })).toBe(false);
    expect(hook.tagOf({ tagId: "gone" })).toBeUndefined();
  });

  it("変更の返事で増えたタグは、描き直す前から絞り込みと表示に使う (付けたそばに隠れるかを決められるように)", async () => {
    await mount(["家"]);
    act(() => hook.setFilter({ kind: "untagged" }));
    let shown: boolean | undefined;
    let name: string | undefined;
    // act の中では描き直さない: 返事を受けた直後 (ブラウザでも描き直す前) の答えを見る
    await act(async () => {
      const list = await hook.register("旅行");
      const id = list.find((t) => t.name === "旅行")!.id;
      shown = hook.isShown({ tagId: id });
      name = hook.tagOf({ tagId: id })?.name;
    });
    expect(shown).toBe(false);
    expect(name).toBe("旅行");
  });

  it("開いたときの一覧をオフライン用のキャッシュに書く (閲覧のみの板では書かない)", async () => {
    writeCachedBoard("u", { sections: [] });
    await mount(["家"], { readOnly: true });
    expect(readCachedBoard("u")?.tags).toEqual([]);
    await act(async () => root.unmount());
    await mount(["家"]);
    expect(readCachedBoard("u")?.tags.map((t) => t.name)).toEqual(["家"]);
  });

  it("一覧が変わったら、オフライン用のキャッシュの一覧も新しくする (閲覧のみの板と、ログアウト後は書かない)", async () => {
    writeCachedBoard("u", { sections: [] });
    await mount(["家"]);
    await act(() => hook.register("買い物"));
    expect(readCachedBoard("u")?.tags.map((t) => t.name)).toEqual(["家", "買い物"]);
    localStorage.removeItem("poi:session-cache");
    writeCachedUser({ id: "someone-else", name: "S" });
    await act(() => hook.register("旅行"));
    expect(readCachedBoard("u")?.tags.map((t) => t.name)).toEqual(["家", "買い物"]);
  });
});
