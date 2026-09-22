import { describe, expect, it } from "vitest";
import type { EditableSection } from "@/lib/board";
import {
  appendSection,
  changeSection,
  mergeSections,
  removeGroup,
  removeSection,
  restoreSections,
} from "@/lib/board-ops";
import { organizeSections } from "@/lib/organized";

const saved = (key: string, content: string): EditableSection => ({
  key,
  id: `id-${key}`,
  content,
  expiresAt: `exp-${key}`,
});
const contents = (sections: EditableSection[]) => sections.map((s) => s.content);

describe("changeSection", () => {
  it("区切りが無ければ内容だけ変える", () => {
    const r = changeSection([saved("a", "x"), saved("b", "y")], "a", "x2", 2)!;
    expect(contents(r.next)).toEqual(["x2", "y"]);
    expect(r.focus).toBeNull();
    expect(r.next[0]).toMatchObject({ key: "a", id: "id-a" });
  });

  it("区切りで分け、先頭が id を、カーソルのある部分が key を引き継ぐ", () => {
    const r = changeSection([saved("a", "x"), saved("b", "y")], "a", "x\n\n\nz", 5)!;
    expect(contents(r.next)).toEqual(["x", "z", "y"]);
    const [first, second] = r.next;
    expect(first).toMatchObject({ id: "id-a", expiresAt: "exp-a" });
    expect(first!.key).not.toBe("a");
    expect(second).toMatchObject({ key: "a", id: null, expiresAt: null });
    expect(r.focus).toEqual({ key: "a", offset: 1 });
    expect(r.revealLast).toBe(false);
  });

  it("カーソルが先頭の部分に残るなら、先頭が key も id も持つ", () => {
    const r = changeSection([saved("a", "x")], "a", "x\n\n\nz", 1)!;
    expect(r.next[0]).toMatchObject({ key: "a", id: "id-a" });
    expect(r.next[1]).toMatchObject({ id: null });
  });

  it("末尾のセクションを分けて新しい末尾へ移るなら revealLast", () => {
    expect(changeSection([saved("a", "x")], "a", "x\n\n\n", 4)!.revealLast).toBe(true);
    expect(changeSection([saved("a", "x"), saved("b", "y")], "a", "x\n\n\n", 4)!.revealLast).toBe(false);
  });

  it("知らない key なら null", () => {
    expect(changeSection([saved("a", "x")], "zz", "", 0)).toBeNull();
  });
});

describe("mergeSections", () => {
  it("前が id を、フォーカスのある方が key を保ち、カーソルはつなぎ目", () => {
    const r = mergeSections([saved("a", "x"), saved("b", "yz"), saved("c", "w")], 0, "b")!;
    expect(r.next).toEqual([
      { key: "b", id: "id-a", expiresAt: "exp-a", content: "xyz" },
      saved("c", "w"),
    ]);
    expect(r.focus).toEqual({ key: "b", offset: 1 });
  });

  it("隣が無ければ null", () => {
    expect(mergeSections([saved("a", "x")], 0, "a")).toBeNull();
  });
});

describe("appendSection", () => {
  it("末尾に空のセクションを足す", () => {
    const r = appendSection([saved("a", "x")]);
    expect(contents(r.next!)).toEqual(["x", ""]);
    expect(r.focus).toEqual({ key: r.next![1]!.key, offset: 0 });
  });

  it("末尾が空ならそれを使う", () => {
    const r = appendSection([saved("a", "x"), { ...saved("b", ""), id: null }]);
    expect(r).toEqual({ next: null, focus: { key: "b", offset: 0 } });
  });

  it("空白だけのセクションは使い回さない", () => {
    expect(appendSection([saved("a", " ")]).next).toHaveLength(2);
  });
});

describe("removeSection / restoreSections", () => {
  it("取り除いて、戻すと元の位置に入る", () => {
    const cur = [saved("a", "x"), saved("b", "y"), saved("c", "z")];
    const r = removeSection(cur, "b")!;
    expect(contents(r.next)).toEqual(["x", "z"]);
    expect(restoreSections(r.next, r.removed)).toEqual(cur);
  });

  it("最後の 1 つを消すと空のセクションが残り、戻すとそれを置き換える", () => {
    const cur = [saved("a", "x")];
    const r = removeSection(cur, "a")!;
    expect(r.next).toHaveLength(1);
    expect(r.next[0]).toMatchObject({ id: null, content: "" });
    expect(restoreSections(r.next, r.removed)).toEqual(cur);
  });

  it("空のセクションに書き足していたら置き換えずに残す", () => {
    const r = removeSection([saved("a", "x")], "a")!;
    const typed = [{ ...r.next[0]!, content: "new" }];
    expect(contents(restoreSections(typed, r.removed))).toEqual(["x", "new"]);
  });
});

describe("removeGroup", () => {
  it("まとめの範囲を各セクションから取り除き、空になったものは消す", () => {
    const cur = [saved("a", "# A\n- 1"), saved("b", "- 前\n# A\n- 2"), saved("c", "# B\n- 3")];
    const group = organizeSections(cur).find((g) => g.heading === "A")!;
    const r = removeGroup(cur, group)!;
    expect(contents(r.next)).toEqual(["- 前", "# B\n- 3"]);
    expect(r.removed.map((d) => d.section.key)).toEqual(["a", "b"]);
    // 戻すと一部だけ削ったものは差し替え、消えたものは元の位置へ
    expect(restoreSections(r.next, r.removed)).toEqual(cur);
  });

  it("どれにも当たらなければ null", () => {
    const group = organizeSections([saved("z", "# Z")])[0]!;
    expect(removeGroup([saved("a", "x")], group)).toBeNull();
  });
});
