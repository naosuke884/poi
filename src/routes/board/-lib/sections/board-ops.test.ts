import { BOARD_MAX_LENGTH, SECTION_SEPARATOR } from "@shared/constants";
import { describe, expect, it } from "vite-plus/test";

import { type EditableSection, newSection } from "../data/board";
import {
  appendSection,
  changeSection,
  mergeSections,
  removeSection,
  restoreSection,
  sectionMaxLength,
} from "./board-ops";

const saved = (key: string, content: string): EditableSection => ({
  key,
  id: `id-${key}`,
  content,
  tagId: null,
  createdAt: `created-${key}`,
  expiresAt: `exp-${key}`,
});
const contents = (sections: EditableSection[]) => sections.map((s) => s.content);

describe("changeSection", () => {
  it("内容だけ変え、key と id はそのまま", () => {
    const next = changeSection([saved("a", "x"), saved("b", "y")], "a", "x2")!;
    expect(contents(next)).toEqual(["x2", "y"]);
    expect(next[0]).toMatchObject({ key: "a", id: "id-a" });
  });

  it("空行 2 つ (改行 3 つ) を書いても分けない", () => {
    const next = changeSection([saved("a", "x"), saved("b", "y")], "a", "x\n\n\nz")!;
    expect(contents(next)).toEqual(["x\n\n\nz", "y"]);
  });

  it("知らない key なら null", () => {
    expect(changeSection([saved("a", "x")], "zz", "")).toBeNull();
  });
});

describe("mergeSections", () => {
  /** 登録済みのタグの id */
  const registered = new Set(["x", "y"]);
  it("前が id を、フォーカスのある方が key を保ち、カーソルはつなぎ目", () => {
    const r = mergeSections(
      [saved("a", "x"), saved("b", "yz"), saved("c", "w")],
      0,
      "b",
      registered,
    )!;
    expect(r.next).toEqual([
      {
        key: "b",
        id: "id-a",
        createdAt: "created-a",
        expiresAt: "exp-a",
        content: "xyz",
        tagId: null,
      },
      saved("c", "w"),
    ]);
    expect(r.focus).toEqual({ key: "b", offset: 1 });
  });

  it("前がまだ保存していないセクションなら、後ろの id と期限を保つ (期限を延ばさない)", () => {
    const r = mergeSections([newSection(""), saved("b", "y")], 0, "b", registered)!;
    expect(r.next).toEqual([
      {
        key: "b",
        id: "id-b",
        createdAt: "created-b",
        expiresAt: "exp-b",
        content: "y",
        tagId: null,
      },
    ]);
  });

  it("前のセクションのタグを残し、前に無ければ後ろのタグを付ける", () => {
    const tagged = (key: string, tagId: string | null) => ({ ...saved(key, key), tagId });
    expect(
      mergeSections([tagged("a", "x"), tagged("b", "y")], 0, "a", registered)!.next[0]!.tagId,
    ).toBe("x");
    expect(
      mergeSections([tagged("a", null), tagged("b", "y")], 0, "a", registered)!.next[0]!.tagId,
    ).toBe("y");
    // 前のタグが登録に無い (別の場所で登録を消された。画面ではタグなし) ときも、後ろのタグを付ける
    expect(
      mergeSections([tagged("a", "gone"), tagged("b", "y")], 0, "a", registered)!.next[0]!.tagId,
    ).toBe("y");
  });

  it("隣が無ければ null", () => {
    expect(mergeSections([saved("a", "x")], 0, "a", registered)).toBeNull();
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

describe("removeSection / restoreSection", () => {
  it("取り除いて、戻すと元の位置に入る", () => {
    const cur = [saved("a", "x"), saved("b", "y"), saved("c", "z")];
    const r = removeSection(cur, "b")!;
    expect(contents(r.next)).toEqual(["x", "z"]);
    expect(restoreSection(r.next, r.removed)).toEqual(cur);
  });

  it("最後の 1 つを消すと空のセクションが残り、戻すとそれを置き換える", () => {
    const cur = [saved("a", "x")];
    const r = removeSection(cur, "a")!;
    expect(r.next).toHaveLength(1);
    expect(r.next[0]).toMatchObject({ id: null, content: "" });
    expect(restoreSection(r.next, r.removed)).toEqual(cur);
  });

  it("空のセクションに書き足していたら置き換えずに残す", () => {
    const r = removeSection([saved("a", "x")], "a")!;
    const typed = [{ ...r.next[0]!, content: "new" }];
    expect(contents(restoreSection(typed, r.removed))).toEqual(["x", "new"]);
  });
});

describe("sectionMaxLength", () => {
  it("板全体の上限から、他の空でないセクションの文字数と区切りのぶんを引く (空のセクションは数えない)", () => {
    const sections = [saved("a", "12345"), saved("b", ""), saved("c", "xyz")];
    const sep = SECTION_SEPARATOR.length;
    expect(sectionMaxLength(sections, "a")).toBe(BOARD_MAX_LENGTH - 3 - sep);
    expect(sectionMaxLength(sections, "b")).toBe(BOARD_MAX_LENGTH - 5 - 3 - 2 * sep);
    expect(sectionMaxLength(sections, "c")).toBe(BOARD_MAX_LENGTH - 5 - sep);
  });
});
