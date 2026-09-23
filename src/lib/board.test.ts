import { BOARD_MAX_LENGTH, BOARD_MAX_SECTIONS } from "@worker/memo/constants";
import { describe, expect, it } from "vitest";
import {
  applySaved,
  applyTtlDays,
  type BoardSection,
  type EditableSection,
  newSection,
  overLimitMessage,
  pruneExpired,
  sameDraft,
  splitAtSeparator,
  toDraft,
  toEditable,
  toPutPayload,
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

describe("applyTtlDays", () => {
  const now = Date.parse("2026-09-23T00:00:00.000Z");
  const saved = (createdAt: string, expiresAt: string): EditableSection => ({
    ...newSection("a"),
    id: "1",
    createdAt,
    expiresAt,
  });

  it("期限前のセクションは createdAt + 日数に引き直す", () => {
    const [s] = applyTtlDays(
      [saved("2026-09-20T00:00:00.000Z", "2026-10-20T00:00:00.000Z")],
      7,
      now,
    );
    expect(s!.expiresAt).toBe("2026-09-27T00:00:00.000Z");
  });

  it("期限を過ぎたセクションと未保存のセクションはそのまま", () => {
    const expired = saved("2026-08-01T00:00:00.000Z", "2026-08-31T00:00:00.000Z");
    const fresh = newSection("b");
    expect(applyTtlDays([expired, fresh], 90, now)).toEqual([expired, fresh]);
  });
});

describe("pruneExpired", () => {
  const now = Date.parse("2026-09-23T00:00:00.000Z");
  const section = (id: string, content: string, expiresAt: string): EditableSection => ({
    ...newSection(content),
    id,
    createdAt: "2026-08-01T00:00:00.000Z",
    expiresAt,
  });
  const past = "2026-09-22T00:00:00.000Z";
  const future = "2026-10-01T00:00:00.000Z";

  it("期限切れが無ければ null", () => {
    expect(pruneExpired([section("1", "a", future), newSection("b")], [], now)).toBeNull();
  });

  it("期限を過ぎた保存済みのセクションを外す", () => {
    const keep = section("2", "b", future);
    const r = pruneExpired(
      [section("1", "a", past), keep],
      [
        { id: "1", content: "a" },
        { id: "2", content: "b" },
      ],
      now,
    )!;
    expect(r.next).toEqual([keep]);
    expect([...r.expiredIds]).toEqual(["1"]);
  });

  it("保存後に書き換えていたものは残し、id を外して新しいセクションにする", () => {
    const r = pruneExpired([section("1", "a2", past)], [{ id: "1", content: "a" }], now)!;
    expect(r.next).toEqual([
      expect.objectContaining({ id: null, content: "a2", createdAt: null, expiresAt: null }),
    ]);
    expect([...r.expiredIds]).toEqual(["1"]);
  });

  it("全部外れたら空のセクションを 1 つ残す", () => {
    const r = pruneExpired([section("1", "a", past)], [{ id: "1", content: "a" }], now)!;
    expect(r.next).toEqual([expect.objectContaining({ id: null, content: "" })]);
  });
});

describe("toPutPayload", () => {
  it("保存済みのセクションには createdAt を付ける", () => {
    expect(
      toPutPayload("u", "r1", [
        { id: "1", content: "a", createdAt: "2026-09-01T00:00:00.000Z" },
        { id: null, content: "b", createdAt: null },
      ]),
    ).toEqual({
      userId: "u",
      revision: "r1",
      sections: [
        { id: "1", content: "a", createdAt: "2026-09-01T00:00:00.000Z" },
        { id: null, content: "b" },
      ],
    });
  });
});

describe("applySaved", () => {
  const section = (key: string, id: string | null, content: string): EditableSection => ({
    key,
    id,
    content,
    createdAt: id && "2026-09-01T00:00:00.000Z",
    expiresAt: id && "2026-10-01T00:00:00.000Z",
  });
  const row = (id: string, content: string) =>
    ({
      id,
      content,
      createdAt: "2026-09-20T00:00:00.000Z",
      expiresAt: "2026-10-20T00:00:00.000Z",
    }) as BoardSection;

  it("送ったセクションにサーバの id と期限を付け、送っていないものは id を外す", () => {
    const r = applySaved(
      [section("a", null, "x"), section("b", "2", "")],
      [{ key: "a" }],
      [row("1", "x")],
      [{ id: "2", content: "y" }],
    );
    expect(r).toEqual([
      {
        key: "a",
        id: "1",
        content: "x",
        createdAt: "2026-09-20T00:00:00.000Z",
        expiresAt: "2026-10-20T00:00:00.000Z",
      },
      { key: "b", id: null, content: "", createdAt: null, expiresAt: null },
    ]);
  });

  it("期限切れで作られなかったものは外し、前回の保存の後に書き換えていたものは id を外して残す (issue #94)", () => {
    const r = applySaved(
      [section("a", "1", "x"), section("b", "2", "y2"), section("c", "3", "z")],
      [{ key: "a" }, { key: "b" }, { key: "c" }],
      [null, null, row("3", "z")],
      [
        { id: "1", content: "x" },
        { id: "2", content: "y" },
        { id: "3", content: "z" },
      ],
    );
    expect(r.map((s) => [s.key, s.id, s.content])).toEqual([
      ["b", null, "y2"],
      ["c", "3", "z"],
    ]);
  });

  it("全部外れたら空のセクションを 1 つ残す", () => {
    const r = applySaved(
      [section("a", "1", "x")],
      [{ key: "a" }],
      [null],
      [{ id: "1", content: "x" }],
    );
    expect(r).toEqual([expect.objectContaining({ id: null, content: "" })]);
  });
});
