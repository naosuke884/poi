import { BOARD_MAX_LENGTH, BOARD_MAX_SECTIONS } from "@worker/memo/constants";
import { describe, expect, it } from "vitest";
import {
  newSection,
  overLimitMessage,
  sameDraft,
  splitAtSeparator,
  toDraft,
  toEditable,
} from "@/lib/board";

describe("splitAtSeparator", () => {
  it("区切りが無ければ null", () => {
    expect(splitAtSeparator("a\n\nb", 1)).toBeNull();
  });

  it("区切りで分け、カーソルのある part とその中の位置を返す", () => {
    // "ab" + 区切り + "cd"。カーソルは c の後
    expect(splitAtSeparator("ab\n\n\ncd", 6)).toEqual({
      parts: ["ab", "cd"],
      focus: { index: 1, offset: 1 },
    });
    expect(splitAtSeparator("ab\n\n\ncd", 1)).toEqual({
      parts: ["ab", "cd"],
      focus: { index: 0, offset: 1 },
    });
  });

  it("区切りの途中のカーソルは次の part の先頭", () => {
    expect(splitAtSeparator("ab\n\n\ncd", 3)?.focus).toEqual({ index: 1, offset: 0 });
    expect(splitAtSeparator("ab\n\n\ncd", 4)?.focus).toEqual({ index: 1, offset: 0 });
  });

  it("区切りの直前のカーソルは前の part の末尾", () => {
    expect(splitAtSeparator("ab\n\n\ncd", 2)?.focus).toEqual({ index: 0, offset: 2 });
  });

  it("末尾で区切ると空の part ができる", () => {
    expect(splitAtSeparator("ab\n\n\n", 5)).toEqual({
      parts: ["ab", ""],
      focus: { index: 1, offset: 0 },
    });
  });

  it("区切りが複数あれば全部で分ける", () => {
    expect(splitAtSeparator("a\n\n\nb\n\n\nc", 9)).toEqual({
      parts: ["a", "b", "c"],
      focus: { index: 2, offset: 1 },
    });
  });
});

describe("toDraft / sameDraft", () => {
  it("空のセクションは保存対象にしない", () => {
    const sections = [{ ...newSection("a"), id: "x" }, newSection(""), newSection(" ")];
    expect(toDraft(sections).map((d) => d.content)).toEqual(["a", " "]);
  });

  it("id・内容・並び順が同じなら同じ", () => {
    const a = [
      { id: "1", content: "a" },
      { id: null, content: "b" },
    ];
    expect(
      sameDraft(a, [
        { id: "1", content: "a" },
        { id: null, content: "b" },
      ]),
    ).toBe(true);
    expect(sameDraft(a, [{ id: "1", content: "a" }])).toBe(false);
    expect(
      sameDraft(a, [
        { id: "1", content: "a" },
        { id: "2", content: "b" },
      ]),
    ).toBe(false);
    expect(
      sameDraft(a, [
        { id: null, content: "b" },
        { id: "1", content: "a" },
      ]),
    ).toBe(false);
  });
});

describe("toEditable", () => {
  it("サーバの id と期限を引き継ぎ、key は画面内で一意", () => {
    const [a, b] = toEditable([
      { id: "1", content: "a", expiresAt: "2026-10-01T00:00:00.000Z" },
      { id: "2", content: "b", expiresAt: "2026-10-02T00:00:00.000Z" },
    ] as Parameters<typeof toEditable>[0]);
    expect(a).toMatchObject({ id: "1", content: "a", expiresAt: "2026-10-01T00:00:00.000Z" });
    expect(a!.key).not.toBe(b!.key);
  });
});

describe("overLimitMessage", () => {
  it("上限内なら null", () => {
    expect(overLimitMessage([{ id: null, content: "a" }])).toBeNull();
  });

  it("セクション数の上限を超えたらメッセージ", () => {
    const draft = Array.from({ length: BOARD_MAX_SECTIONS + 1 }, () => ({
      id: null,
      content: "a",
    }));
    expect(overLimitMessage(draft)).toMatch(/セクション数/);
  });

  it("文字数の上限は区切りの長さも含めて数える", () => {
    const half = "a".repeat(BOARD_MAX_LENGTH / 2);
    expect(overLimitMessage([{ id: null, content: half }])).toBeNull();
    expect(
      overLimitMessage([
        { id: null, content: half },
        { id: null, content: half },
      ]),
    ).toMatch(/文字数/);
  });
});
