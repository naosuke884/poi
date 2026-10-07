import { describe, expect, it } from "vitest";
import type { BoardSection, EditableSection } from "../data/board";
import { mergeBoard } from "./board-merge";

const CREATED = "2026-01-01T00:00:00.000Z";
const EXPIRES = "2099-01-01T00:00:00.000Z";

const local = (key: string, id: string | null, content: string): EditableSection => ({
  key,
  id,
  content,
  createdAt: id === null ? null : CREATED,
  expiresAt: id === null ? null : EXPIRES,
});
const remote = (id: string, content: string, expiresAt = EXPIRES) =>
  ({ id, content, createdAt: CREATED, expiresAt }) as BoardSection;

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
        { id: "a", content: "a" },
        { id: "b", content: "b" },
      ],
      [remote("x", "x"), remote("a", "a"), remote("y", "y"), remote("z", "z"), remote("b", "b")],
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
        { id: "a", content: "a" },
        { id: "b", content: "b" },
      ],
      [remote("a", "a remote", "2099-02-01T00:00:00.000Z"), remote("b", "b remote")],
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
        { id: "a", content: "a" },
        { id: "b", content: "b" },
        { id: "c", content: "c" },
      ],
      [remote("c", "c")],
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
        { id: "a", content: "a" },
        { id: "b", content: "b" },
        { id: "c", content: "c" },
      ],
      [remote("a", "a"), remote("b", "b"), remote("c", "c remote")],
    );
    expect(view(merged)).toEqual([
      { key: "k1", id: "a", content: "a" },
      { key: "new", id: "c", content: "c remote" },
    ]);
  });

  it("まだ保存していないセクションは位置もそのまま残す", () => {
    const merged = mergeBoard(
      [local("k1", null, "draft"), local("k2", "a", "a"), local("k3", null, "")],
      [{ id: "a", content: "a" }],
      [remote("a", "a"), remote("x", "x")],
    );
    expect(view(merged)).toEqual([
      { key: "k1", id: null, content: "draft" },
      { key: "k2", id: "a", content: "a" },
      { key: "new", id: "x", content: "x" },
      { key: "k3", id: null, content: "" },
    ]);
  });

  it("全部消えたら空のセクションを 1 つ置く", () => {
    const merged = mergeBoard([local("k1", "a", "a")], [{ id: "a", content: "a" }], []);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: null, content: "" });
  });
});
