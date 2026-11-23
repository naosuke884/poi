import { describe, expect, it } from "vite-plus/test";

import {
  dropUnregisteredTags,
  type ExistingSection,
  type IncomingSection,
  planBoardSync,
} from "./board-sync";

const row = (id: string, content: string, position: number, tagId: string | null = null) => ({
  id,
  content,
  position,
  tagId,
});

// createdAt がこれ以前のものは今の保持日数では期限切れ
const EXPIRED_CREATED_AT = new Date("2026-09-01T00:00:00.000Z");

// 新規の id を n1, n2, ... と決まった値で発行する
const plan = (
  existing: ExistingSection[],
  sections: IncomingSection[],
  expiredIds: string[] = [],
) => {
  let n = 0;
  return planBoardSync(
    existing,
    sections,
    EXPIRED_CREATED_AT,
    new Set(expiredIds),
    () => `n${++n}`,
  );
};

describe("planBoardSync", () => {
  it("変わっていないセクションは触らない", () => {
    expect(
      plan(
        [row("a", "x", 0), row("b", "y", 1)],
        [
          { id: "a", content: "x" },
          { id: "b", content: "y" },
        ],
      ),
    ).toEqual({ updates: [], inserts: [], deletes: [], ids: ["a", "b"] });
  });

  it("内容か並び順が変わった既存の行を更新する", () => {
    expect(
      plan(
        [row("a", "x", 0), row("b", "y", 1)],
        [
          { id: "b", content: "y" },
          { id: "a", content: "x2" },
        ],
      ),
    ).toEqual({
      updates: [
        { id: "b", content: "y", position: 0, tagId: null },
        { id: "a", content: "x2", position: 1, tagId: null },
      ],
      inserts: [],
      deletes: [],
      ids: ["b", "a"],
    });
  });

  it("タグだけが変わった既存の行も更新する (付け替え・外す・付ける)", () => {
    expect(
      plan(
        [
          row("a", "x", 0, "買い物"),
          row("b", "y", 1, "家"),
          row("c", "z", 2),
          row("d", "w", 3, "家"),
        ],
        [
          { id: "a", content: "x", tagId: "家" },
          { id: "b", content: "y", tagId: null },
          { id: "c", content: "z", tagId: "買い物" },
          { id: "d", content: "w", tagId: "家" },
        ],
      ),
    ).toEqual({
      updates: [
        { id: "a", content: "x", position: 0, tagId: "家" },
        { id: "b", content: "y", position: 1, tagId: null },
        { id: "c", content: "z", position: 2, tagId: "買い物" },
      ],
      inserts: [],
      deletes: [],
      ids: ["a", "b", "c", "d"],
    });
  });

  it("タグの項目なしで送られた既存の行は、今のタグを変えない (タグを知らない古いページの保存)", () => {
    expect(
      plan(
        [row("a", "x", 0, "買い物"), row("b", "y", 1, "家")],
        [
          { id: "a", content: "x" },
          { id: "b", content: "y2" },
        ],
      ),
    ).toEqual({
      updates: [{ id: "b", content: "y2", position: 1, tagId: "家" }],
      inserts: [],
      deletes: [],
      ids: ["a", "b"],
    });
  });

  it("新しく作る行には送られたタグを付け、項目なしで送られたらタグなしにする", () => {
    expect(
      plan(
        [],
        [
          { id: null, content: "x", tagId: "買い物" },
          { id: null, content: "y" },
        ],
      ),
    ).toEqual({
      updates: [],
      inserts: [
        { id: "n1", content: "x", position: 0, tagId: "買い物" },
        { id: "n2", content: "y", position: 1, tagId: null },
      ],
      deletes: [],
      ids: ["n1", "n2"],
    });
  });

  it("id が null・知らない id は新規作成", () => {
    expect(
      plan(
        [row("a", "x", 0)],
        [
          { id: "a", content: "x" },
          { id: null, content: "new" },
          { id: "gone", content: "restored" },
        ],
      ),
    ).toEqual({
      updates: [],
      inserts: [
        { id: "n1", content: "new", position: 1, tagId: null },
        { id: "n2", content: "restored", position: 2, tagId: null },
      ],
      deletes: [],
      ids: ["a", "n1", "n2"],
    });
  });

  it("知らない id で createdAt が今の保持日数で期限切れのものは作らず、position を詰める (issue #94)", () => {
    expect(
      plan(
        [row("a", "x", 0), row("b", "y", 2)],
        [
          { id: "a", content: "x", createdAt: "2026-08-01T00:00:00.000Z" },
          { id: "gone", content: "old", createdAt: "2026-09-01T00:00:00.000Z" },
          { id: "b", content: "y", createdAt: "2026-09-10T00:00:00.000Z" },
          { id: "deleted", content: "fresh", createdAt: "2026-09-10T00:00:00.000Z" },
          { id: "legacy", content: "no createdAt" },
        ],
      ),
    ).toEqual({
      updates: [{ id: "b", content: "y", position: 1, tagId: null }],
      inserts: [
        { id: "n1", content: "fresh", position: 2, tagId: null },
        { id: "n2", content: "no createdAt", position: 3, tagId: null },
      ],
      deletes: [],
      ids: ["a", null, "b", "n1", "n2"],
    });
  });

  it("期限切れの行の id は、createdAt が今の保持日数の範囲内でも、無くても作らず、position を詰める (HAY-60)", () => {
    expect(
      plan(
        [row("a", "x", 2)],
        [
          { id: "expired", content: "old", createdAt: "2026-09-10T00:00:00.000Z" },
          { id: "expired-legacy", content: "no createdAt" },
          { id: "a", content: "x" },
        ],
        ["expired", "expired-legacy"],
      ),
    ).toEqual({
      updates: [{ id: "a", content: "x", position: 0, tagId: null }],
      inserts: [],
      deletes: [],
      ids: [null, null, "a"],
    });
  });

  it("保持日数の変更で期限を引き直した行は、createdAt が今の保持日数より古くても既存の行として更新する (HAY-59)", () => {
    expect(
      plan(
        [row("retimed", "x", 0)],
        [{ id: "retimed", content: "x2", createdAt: "2026-08-01T00:00:00.000Z" }],
      ),
    ).toEqual({
      updates: [{ id: "retimed", content: "x2", position: 0, tagId: null }],
      inserts: [],
      deletes: [],
      ids: ["retimed"],
    });
  });

  it("同じ id の 2 つ目以降は、createdAt が今の保持日数より古くても捨てずに新規作成 (HAY-59)", () => {
    expect(
      plan(
        [row("retimed", "x", 0)],
        [
          { id: "retimed", content: "x", createdAt: "2026-08-01T00:00:00.000Z" },
          { id: "retimed", content: "copy", createdAt: "2026-08-01T00:00:00.000Z" },
        ],
      ),
    ).toEqual({
      updates: [],
      inserts: [{ id: "n1", content: "copy", position: 1, tagId: null }],
      deletes: [],
      ids: ["retimed", "n1"],
    });
  });

  it("同じ id の 2 つ目以降は新規作成", () => {
    expect(
      plan(
        [row("a", "x", 0)],
        [
          { id: "a", content: "x" },
          { id: "a", content: "copy" },
        ],
      ),
    ).toEqual({
      updates: [],
      inserts: [{ id: "n1", content: "copy", position: 1, tagId: null }],
      deletes: [],
      ids: ["a", "n1"],
    });
  });

  it("送られてこなかった既存の行は削除", () => {
    expect(plan([row("a", "x", 0), row("b", "y", 1)], [{ id: "b", content: "y" }])).toEqual({
      updates: [{ id: "b", content: "y", position: 0, tagId: null }],
      inserts: [],
      deletes: ["a"],
      ids: ["b"],
    });
  });

  it("空の板を送ると全部削除", () => {
    expect(plan([row("a", "x", 0)], [])).toEqual({
      updates: [],
      inserts: [],
      deletes: ["a"],
      ids: [],
    });
  });
});

describe("dropUnregisteredTags", () => {
  it("登録に無いタグはタグなしにし、登録済みのタグ・タグなし・tagId の項目が無いものはそのまま", () => {
    expect(
      dropUnregisteredTags(
        [
          { id: "a", content: "a", tagId: "消えたタグ" },
          { id: "b", content: "b", tagId: "家" },
          { id: "c", content: "c", tagId: null },
          { id: "d", content: "d" },
        ],
        new Set(["家"]),
      ),
    ).toEqual([
      { id: "a", content: "a", tagId: null },
      { id: "b", content: "b", tagId: "家" },
      { id: "c", content: "c", tagId: null },
      { id: "d", content: "d" },
    ]);
  });
});
