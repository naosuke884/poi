import { describe, expect, it } from "vitest";
import { minimalChange } from "@/lib/minimal-change";

/** 置換を当てた結果 */
const apply = (s: string, c: ReturnType<typeof minimalChange>) =>
  c ? s.slice(0, c.from) + c.insert + s.slice(c.to) : s;

describe("minimalChange", () => {
  it("同じなら null", () => {
    expect(minimalChange("abc", "abc")).toBeNull();
  });

  it("変わった範囲だけを置き換える", () => {
    expect(minimalChange("abcdef", "abXYef")).toEqual({ from: 2, to: 4, insert: "XY" });
  });

  it("末尾への追加 (結合) は挿入だけ", () => {
    expect(minimalChange("- a", "- a- b")).toEqual({ from: 3, to: 3, insert: "- b" });
  });

  it("末尾の削除 (分割) は削除だけ", () => {
    expect(minimalChange("- a\n\n\n- b", "- a")).toEqual({ from: 3, to: 9, insert: "" });
  });

  it("繰り返しの中の変更でも、前後が重ならない", () => {
    for (const [a, b] of [
      ["aaa", "aa"],
      ["aa", "aaaa"],
      ["abab", "ab"],
      ["", "x"],
      ["x", ""],
    ] as const) {
      const c = minimalChange(a, b)!;
      expect(c.from).toBeLessThanOrEqual(c.to);
      expect(apply(a, c)).toBe(b);
    }
  });
});
