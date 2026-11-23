import { BOARD_MAX_LENGTH, BOARD_MAX_SECTIONS } from "@shared/constants";
import { describe, expect, it } from "vite-plus/test";

import {
  applySaved,
  type BoardSection,
  type EditableSection,
  newSection,
  overLimitMessage,
  pruneExpired,
  sameDraft,
  toDraft,
  toEditable,
  toPutPayload,
} from "./board";

describe("toDraft / sameDraft", () => {
  it("空のセクションは保存対象にしない", () => {
    const sections = [{ ...newSection("a"), id: "x" }, newSection(""), newSection(" ")];
    expect(toDraft(sections).map((d) => d.content)).toEqual(["a", " "]);
  });

  it("id・内容・並び順が同じなら同じ", () => {
    const a = [
      { id: "1", content: "a", tagId: null },
      { id: null, content: "b", tagId: null },
    ];
    expect(
      sameDraft(a, [
        { id: "1", content: "a", tagId: null },
        { id: null, content: "b", tagId: null },
      ]),
    ).toBe(true);
    expect(sameDraft(a, [{ id: "1", content: "a", tagId: null }])).toBe(false);
    expect(
      sameDraft(a, [
        { id: "1", content: "a", tagId: null },
        { id: "2", content: "b", tagId: null },
      ]),
    ).toBe(false);
    expect(
      sameDraft(a, [
        { id: null, content: "b", tagId: null },
        { id: "1", content: "a", tagId: null },
      ]),
    ).toBe(false);
  });
});

describe("sameDraft", () => {
  it("タグだけが違っても、変更として扱う", () => {
    const saved = [{ id: "1", content: "a", tagId: "x" }];
    expect(sameDraft([{ id: "1", content: "a", tagId: "x" }], saved)).toBe(true);
    expect(sameDraft([{ id: "1", content: "a", tagId: null }], saved)).toBe(false);
    expect(sameDraft([{ id: "1", content: "a", tagId: "y" }], saved)).toBe(false);
  });
});

describe("toEditable", () => {
  it("タグを引き継ぎ、tagId の無い行 (タグの導入前に端末に残したキャッシュ。名前の tag が残るものも) はタグなしにする", () => {
    const [a, b, c] = toEditable([
      { id: "1", content: "a", tagId: "t1" },
      { id: "2", content: "b" },
      { id: "3", content: "c", tag: "買い物" },
    ] as Parameters<typeof toEditable>[0]);
    expect(a!.tagId).toBe("t1");
    expect(b!.tagId).toBeNull();
    expect(c!.tagId).toBeNull();
    expect(c).not.toHaveProperty("tag");
  });

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
    expect(overLimitMessage([{ id: null, content: "a", tagId: null }])).toBeNull();
  });

  it("セクション数の上限を超えたらメッセージ", () => {
    const draft = Array.from({ length: BOARD_MAX_SECTIONS + 1 }, () => ({
      id: null,
      content: "a",
      tagId: null,
    }));
    expect(overLimitMessage(draft)).toMatch(/セクション数/);
  });

  it("文字数の上限は区切りの長さも含めて数える", () => {
    const half = "a".repeat(BOARD_MAX_LENGTH / 2);
    expect(overLimitMessage([{ id: null, content: half, tagId: null }])).toBeNull();
    expect(
      overLimitMessage([
        { id: null, content: half, tagId: null },
        { id: null, content: half, tagId: null },
      ]),
    ).toMatch(/文字数/);
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
        { id: "1", content: "a", tagId: null },
        { id: "2", content: "b", tagId: null },
      ],
      now,
    )!;
    expect(r.next).toEqual([keep]);
    expect([...r.expiredIds]).toEqual(["1"]);
  });

  it("保存後に書き換えていたものは残し、id を外して新しいセクションにする", () => {
    const r = pruneExpired(
      [section("1", "a2", past)],
      [{ id: "1", content: "a", tagId: null }],
      now,
    )!;
    expect(r.next).toEqual([
      expect.objectContaining({ id: null, content: "a2", createdAt: null, expiresAt: null }),
    ]);
    expect([...r.expiredIds]).toEqual(["1"]);
  });

  it("保存後にタグだけを変えていたものは、書き換えていないものとして外す (新しい期限で作り直さない)", () => {
    const r = pruneExpired(
      [{ ...section("1", "a", past), tagId: "home" }, section("2", "b", future)],
      [
        { id: "1", content: "a", tagId: null },
        { id: "2", content: "b", tagId: null },
      ],
      now,
    )!;
    expect(r.next.map((s) => s.id)).toEqual(["2"]);
  });

  it("全部外れたら空のセクションを 1 つ残す", () => {
    const r = pruneExpired(
      [section("1", "a", past)],
      [{ id: "1", content: "a", tagId: null }],
      now,
    )!;
    expect(r.next).toEqual([expect.objectContaining({ id: null, content: "", tagId: null })]);
  });
});

describe("toPutPayload", () => {
  it("保存済みのセクションには createdAt を付ける", () => {
    expect(
      toPutPayload("u", "r1", [
        { id: "1", content: "a", tagId: "買い物", createdAt: "2026-09-01T00:00:00.000Z" },
        { id: null, content: "b", tagId: null, createdAt: null },
      ]),
    ).toEqual({
      userId: "u",
      revision: "r1",
      sections: [
        { id: "1", content: "a", tagId: "買い物", createdAt: "2026-09-01T00:00:00.000Z" },
        { id: null, content: "b", tagId: null },
      ],
    });
  });
});

describe("applySaved", () => {
  const section = (key: string, id: string | null, content: string): EditableSection => ({
    key,
    id,
    content,
    tagId: null,
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
      [{ key: "a", id: null, tagId: null }],
      [row("1", "x")],
      [{ id: "2", content: "y", tagId: null }],
    );
    expect(r).toEqual([
      {
        key: "a",
        id: "1",
        content: "x",
        tagId: null,
        createdAt: "2026-09-20T00:00:00.000Z",
        expiresAt: "2026-10-20T00:00:00.000Z",
      },
      { key: "b", id: null, content: "", tagId: null, createdAt: null, expiresAt: null },
    ]);
  });

  it("期限切れで作られなかったものは外し、前回の保存の後に書き換えていたものは id を外して残す (issue #94)", () => {
    const r = applySaved(
      [section("a", "1", "x"), section("b", "2", "y2"), section("c", "3", "z")],
      [
        { key: "a", id: "1", tagId: null },
        { key: "b", id: "2", tagId: null },
        { key: "c", id: "3", tagId: null },
      ],
      [null, null, row("3", "z")],
      [
        { id: "1", content: "x", tagId: null },
        { id: "2", content: "y", tagId: null },
        { id: "3", content: "z", tagId: null },
      ],
    );
    expect(r.map((s) => [s.key, s.id, s.content])).toEqual([
      ["b", null, "y2"],
      ["c", "3", "z"],
    ]);
  });

  it("保存中に保存済みのセクションどうしを結合し、id が前のセクションのものに変わったら、その id のままにする", () => {
    // 保存中に a (id 1) と b (id 2) を、フォーカスのある b の key で結合した (id は前の a のもの)
    const merged = { ...section("b", "1", "xy") };
    const r = applySaved(
      [merged],
      [
        { key: "a", id: "1", tagId: null },
        { key: "b", id: "2", tagId: null },
      ],
      [row("1", "x"), row("2", "y")],
      [
        { id: "1", content: "x", tagId: null },
        { id: "2", content: "y", tagId: null },
      ],
    );
    expect(r.map((s) => [s.key, s.id])).toEqual([["b", "1"]]);
  });

  it("期限切れで作られなかったもののうち、前回の保存の後にタグだけを変えていたものは外す (新しい期限で作り直さない)", () => {
    const r = applySaved(
      [{ ...section("a", "1", "x"), tagId: "home" }, section("b", "2", "y")],
      [
        { key: "a", id: "1", tagId: "home" },
        { key: "b", id: "2", tagId: null },
      ],
      [null, row("2", "y")],
      [
        { id: "1", content: "x", tagId: null },
        { id: "2", content: "y", tagId: null },
      ],
    );
    expect(r.map((s) => s.key)).toEqual(["b"]);
  });

  it("サーバが外したタグ (登録に無いタグ) は画面からも外し、保存中に付け替えたタグはそのまま残す", () => {
    const tagged = (key: string, id: string, tagId: string): EditableSection => ({
      ...section(key, id, "x"),
      tagId,
    });
    const r = applySaved(
      [tagged("a", "1", "消えたタグ"), tagged("b", "2", "付け替えた")],
      [
        { key: "a", id: "1", tagId: "消えたタグ" },
        { key: "b", id: "2", tagId: "消えたタグ" },
      ],
      [
        { ...row("1", "x"), tagId: null },
        { ...row("2", "x"), tagId: null },
      ],
      [],
    );
    expect(r.map((s) => [s.key, s.tagId])).toEqual([
      ["a", null],
      ["b", "付け替えた"],
    ]);
  });

  it("新しいセクションとして送ったものが、保存中に保存済みのセクションと結合されていたら、残した保存済みの id のままにする", () => {
    // a を新しいセクションとして送っている間に、後ろの保存済みの b ("2") と結合した (key は a、id は b のもの)
    const r = applySaved(
      [section("a", "2", "xy")],
      [{ key: "a", id: null, tagId: null }],
      [row("new-1", "x")],
      [{ id: "2", content: "y", tagId: null }],
    );
    expect(r.map((s) => [s.key, s.id, s.createdAt])).toEqual([
      ["a", "2", "2026-09-01T00:00:00.000Z"],
    ]);
  });

  it("全部外れたら空のセクションを 1 つ残す", () => {
    const r = applySaved(
      [section("a", "1", "x")],
      [{ key: "a", id: "1", tagId: null }],
      [null],
      [{ id: "1", content: "x", tagId: null }],
    );
    expect(r).toEqual([expect.objectContaining({ id: null, content: "", tagId: null })]);
  });
});
