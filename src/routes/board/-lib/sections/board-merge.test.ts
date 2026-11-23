import { describe, expect, it } from "vite-plus/test";

import type { BoardSection, EditableSection } from "../data/board";
import { mergeBoard } from "./board-merge";

const CREATED = "2026-01-01T00:00:00.000Z";
const EXPIRES = "2099-01-01T00:00:00.000Z";

const local = (key: string, id: string | null, content: string): EditableSection => ({
  key,
  id,
  content,
  tagId: null,
  createdAt: id === null ? null : CREATED,
  expiresAt: id === null ? null : EXPIRES,
});
const remote = (id: string, content: string, expiresAt = EXPIRES, tagId: string | null = null) =>
  ({ id, content, tagId, createdAt: CREATED, expiresAt }) as BoardSection;
/** remote の板 (セクション) と、登録済みとして扱うタグの id (既定は「買い物」「家」の 2 つ)。mergeBoard の後ろ 2 つの引数 */
const board = (sections: BoardSection[], tagIds = ["shop", "home"]) =>
  [sections, new Set(tagIds)] as const;

// 比べやすいよう、key は手元のもの (k*) だけ残し、remote から来たものは "new" にする
const view = (sections: EditableSection[]) =>
  sections.map((s) => ({
    key: s.key.startsWith("k") ? s.key : "new",
    id: s.id,
    content: s.content,
  }));

describe("mergeBoard", () => {
  it("別の場所で足されたセクションを、remote で直前にあるセクションの後ろに入れる", () => {
    const merged = mergeBoard(
      [local("k1", "a", "a"), local("k2", "b", "b2")],
      [
        { id: "a", content: "a", tagId: null },
        { id: "b", content: "b", tagId: null },
      ],
      ...board([
        remote("x", "x"),
        remote("a", "a"),
        remote("y", "y"),
        remote("z", "z"),
        remote("b", "b"),
      ]),
    );
    expect(view(merged)).toEqual([
      { key: "new", id: "x", content: "x" },
      { key: "k1", id: "a", content: "a" },
      { key: "new", id: "y", content: "y" },
      { key: "new", id: "z", content: "z" },
      { key: "k2", id: "b", content: "b2" },
    ]);
  });

  it("手元で変えていないセクションは remote の内容に、変えたものは手元の内容にする", () => {
    const merged = mergeBoard(
      [local("k1", "a", "a"), local("k2", "b", "b local")],
      [
        { id: "a", content: "a", tagId: null },
        { id: "b", content: "b", tagId: null },
      ],
      ...board([remote("a", "a remote", "2099-02-01T00:00:00.000Z"), remote("b", "b remote")]),
    );
    expect(view(merged)).toEqual([
      { key: "k1", id: "a", content: "a remote" },
      { key: "k2", id: "b", content: "b local" },
    ]);
    expect(merged[0]!.expiresAt).toBe("2099-02-01T00:00:00.000Z");
  });

  it("別の場所で消されたセクションは、手元で変えていなければ消し、変えていれば新しいセクションとして残す", () => {
    const merged = mergeBoard(
      [local("k1", "a", "a"), local("k2", "b", "b local"), local("k3", "c", "c")],
      [
        { id: "a", content: "a", tagId: null },
        { id: "b", content: "b", tagId: null },
        { id: "c", content: "c", tagId: null },
      ],
      ...board([remote("c", "c")]),
    );
    expect(view(merged)).toEqual([
      { key: "k2", id: null, content: "b local" },
      { key: "k3", id: "c", content: "c" },
    ]);
    expect(merged[0]!.expiresAt).toBeNull();
  });

  it("手元で消したセクションは、別の場所で変えられていなければ消したまま、変えられていれば戻す", () => {
    const merged = mergeBoard(
      [local("k1", "a", "a")],
      [
        { id: "a", content: "a", tagId: null },
        { id: "b", content: "b", tagId: null },
        { id: "c", content: "c", tagId: null },
      ],
      ...board([remote("a", "a"), remote("b", "b"), remote("c", "c remote")]),
    );
    expect(view(merged)).toEqual([
      { key: "k1", id: "a", content: "a" },
      { key: "new", id: "c", content: "c remote" },
    ]);
  });

  it("まだ保存していないセクションは位置もそのまま残す", () => {
    const merged = mergeBoard(
      [local("k1", null, "draft"), local("k2", "a", "a"), local("k3", null, "")],
      [{ id: "a", content: "a", tagId: null }],
      ...board([remote("a", "a"), remote("x", "x")]),
    );
    expect(view(merged)).toEqual([
      { key: "k1", id: null, content: "draft" },
      { key: "k2", id: "a", content: "a" },
      { key: "new", id: "x", content: "x" },
      { key: "k3", id: null, content: "" },
    ]);
  });

  it("全部消えたら空のセクションを 1 つ置く", () => {
    const merged = mergeBoard(
      [local("k1", "a", "a")],
      [{ id: "a", content: "a", tagId: null }],
      ...board([]),
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: null, content: "", tagId: null });
  });

  it("別の場所でタグだけが変わったセクションは、手元で変えていなければそのタグにする", () => {
    const merged = mergeBoard(
      [local("k1", "a", "a")],
      [{ id: "a", content: "a", tagId: null }],
      ...board([remote("a", "a", EXPIRES, "shop")]),
    );
    expect(merged.map((s) => s.tagId)).toEqual(["shop"]);
  });

  it("手元でタグだけを変えたセクションは、別の場所で内容が変わっていても手元の内容とタグを残す", () => {
    const merged = mergeBoard(
      [{ ...local("k1", "a", "a"), tagId: "home" }],
      [{ id: "a", content: "a", tagId: null }],
      ...board([remote("a", "a2", EXPIRES, "shop")]),
    );
    expect(merged.map((s) => [s.content, s.tagId])).toEqual([["a", "home"]]);
  });

  it("手元で消したセクションは、別の場所でタグだけが変えられていても戻す", () => {
    const merged = mergeBoard(
      [local("k1", "a", "a")],
      [
        { id: "a", content: "a", tagId: null },
        { id: "b", content: "b", tagId: null },
      ],
      ...board([remote("a", "a"), remote("b", "b", EXPIRES, "shop")]),
    );
    expect(merged.map((s) => [s.id, s.tagId])).toEqual([
      ["a", null],
      ["b", "shop"],
    ]);
  });

  it("登録を消されたタグ (remote の登録に無い) は、外れたことを別の場所での変更とみなさず、手元で消したセクションを戻さない", () => {
    const merged = mergeBoard(
      [local("k1", "a", "a")],
      [
        { id: "a", content: "a", tagId: null },
        { id: "b", content: "b", tagId: "shop" },
      ],
      ...board([remote("a", "a"), remote("b", "b")], ["home"]),
    );
    expect(view(merged)).toEqual([{ key: "k1", id: "a", content: "a" }]);
  });

  it("手元で書き換えたセクションに付いていた、登録を消されたタグは外して残す", () => {
    const merged = mergeBoard(
      [{ ...local("k1", "a", "a2"), tagId: "shop" }, local("k2", "b", "b")],
      [
        { id: "a", content: "a", tagId: "shop" },
        { id: "b", content: "b", tagId: null },
      ],
      ...board([remote("a", "a"), remote("b", "b remote")], ["home"]),
    );
    expect(merged.map((s) => [s.content, s.tagId])).toEqual([
      ["a2", null],
      ["b remote", null],
    ]);
  });

  it("別の場所で消された (期限切れも含む) セクションは、手元でタグだけを変えていても消す (新しい期限で作り直さない)", () => {
    const merged = mergeBoard(
      [{ ...local("k1", "a", "a"), tagId: "shop" }, local("k2", "b", "b")],
      [
        { id: "a", content: "a", tagId: null },
        { id: "b", content: "b", tagId: null },
      ],
      ...board([remote("b", "b")]),
    );
    expect(view(merged)).toEqual([{ key: "k2", id: "b", content: "b" }]);
  });
});
