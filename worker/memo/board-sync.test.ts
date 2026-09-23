import { describe, expect, it } from "vitest";
import { type ExistingSection, type IncomingSection, planBoardSync } from "./board-sync";

const row = (id: string, content: string, position: number) => ({ id, content, position });

// 新規の id を n1, n2, ... と決まった値で発行する
const plan = (existing: ExistingSection[], sections: IncomingSection[]) => {
  let n = 0;
  return planBoardSync(existing, sections, () => `n${++n}`);
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
        { id: "b", content: "y", position: 0 },
        { id: "a", content: "x2", position: 1 },
      ],
      inserts: [],
      deletes: [],
      ids: ["b", "a"],
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
        { id: "n1", content: "new", position: 1 },
        { id: "n2", content: "restored", position: 2 },
      ],
      deletes: [],
      ids: ["a", "n1", "n2"],
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
      inserts: [{ id: "n1", content: "copy", position: 1 }],
      deletes: [],
      ids: ["a", "n1"],
    });
  });

  it("送られてこなかった既存の行は削除", () => {
    expect(plan([row("a", "x", 0), row("b", "y", 1)], [{ id: "b", content: "y" }])).toEqual({
      updates: [{ id: "b", content: "y", position: 0 }],
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
