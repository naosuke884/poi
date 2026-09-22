import { describe, expect, it } from "vitest";
import { planBoardSync } from "./board-sync";

const row = (id: string, content: string, position: number) => ({ id, content, position });

describe("planBoardSync", () => {
  it("変わっていないセクションは触らない", () => {
    expect(planBoardSync([row("a", "x", 0), row("b", "y", 1)], [
      { id: "a", content: "x" },
      { id: "b", content: "y" },
    ])).toEqual({ updates: [], inserts: [], deletes: [] });
  });

  it("内容か並び順が変わった既存の行を更新する", () => {
    expect(planBoardSync([row("a", "x", 0), row("b", "y", 1)], [
      { id: "b", content: "y" },
      { id: "a", content: "x2" },
    ])).toEqual({
      updates: [
        { id: "b", content: "y", position: 0 },
        { id: "a", content: "x2", position: 1 },
      ],
      inserts: [],
      deletes: [],
    });
  });

  it("id が null・知らない id は新規作成", () => {
    expect(planBoardSync([row("a", "x", 0)], [
      { id: "a", content: "x" },
      { id: null, content: "new" },
      { id: "gone", content: "restored" },
    ])).toEqual({
      updates: [],
      inserts: [
        { content: "new", position: 1 },
        { content: "restored", position: 2 },
      ],
      deletes: [],
    });
  });

  it("同じ id の 2 つ目以降は新規作成", () => {
    expect(planBoardSync([row("a", "x", 0)], [
      { id: "a", content: "x" },
      { id: "a", content: "copy" },
    ])).toEqual({
      updates: [],
      inserts: [{ content: "copy", position: 1 }],
      deletes: [],
    });
  });

  it("送られてこなかった既存の行は削除", () => {
    expect(planBoardSync([row("a", "x", 0), row("b", "y", 1)], [{ id: "b", content: "y" }])).toEqual({
      updates: [{ id: "b", content: "y", position: 0 }],
      inserts: [],
      deletes: ["a"],
    });
  });

  it("空の板を送ると全部削除", () => {
    expect(planBoardSync([row("a", "x", 0)], [])).toEqual({ updates: [], inserts: [], deletes: ["a"] });
  });
});
