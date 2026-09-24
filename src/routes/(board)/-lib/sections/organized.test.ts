import { describe, expect, it } from "vitest";
import type { EditableSection } from "../board";
import { cutRanges, locateInSection, organizeSections } from "./organized";

const section = (key: string, content: string): EditableSection => ({
  key,
  id: null,
  content,
  createdAt: null,
  expiresAt: null,
});

describe("organizeSections", () => {
  it("同じ見出しのセクションを初出順に 1 つのグループへまとめる", () => {
    const groups = organizeSections([
      section("a", "# 買い物\n- 牛乳"),
      section("b", "# 仕事\n- 資料"),
      section("c", "# 買い物\n- 卵"),
    ]);
    expect(groups.map((g) => g.heading)).toEqual(["買い物", "仕事"]);
    expect(groups[0]!.content).toBe("# 買い物\n\n- 牛乳\n\n- 卵");
    expect(groups[0]!.chunkCount).toBe(2);
  });

  it("見出しの無い内容は最後の「見出しなし」グループ", () => {
    const groups = organizeSections([
      section("a", "- メモ\n# 見出し\n- 本文"),
      section("b", "- 別"),
    ]);
    expect(groups.map((g) => g.heading)).toEqual(["見出し", null]);
    expect(groups[1]!.content).toBe("- メモ\n\n- 別");
  });

  it("親が違えば同じテキストの見出しでも別のまとめ", () => {
    const groups = organizeSections([
      section("a", "# A\n## メモ\n- 1"),
      section("b", "# B\n## メモ\n- 2"),
    ]);
    expect(groups.map((g) => g.content)).toEqual([
      "# A\n\n## メモ\n\n- 1",
      "# B\n\n## メモ\n\n- 2",
    ]);
  });

  it("子見出しは親の本文の後ろにまとまる", () => {
    const groups = organizeSections([
      section("a", "# A\n## x\n- 1"),
      section("b", "# A\n- 本文\n## x\n- 2"),
    ]);
    expect(groups[0]!.content).toBe("# A\n\n- 本文\n\n## x\n\n- 1\n\n- 2");
  });

  it("空のセクションは含めない", () => {
    expect(organizeSections([section("a", ""), section("b", "  ")])).toEqual([]);
  });

  it("インデントされた本文の先頭は dedent して、元の位置と対応づける", () => {
    const [group] = organizeSections([section("a", "# A\n  - 子")]);
    expect(group!.content).toBe("# A\n\n- 子");
    // まとめ内の「子」の位置 → 元セクションの「子」の位置
    const offset = group!.content.indexOf("子");
    expect(locateInSection(group!.ranges, offset)).toEqual({
      sectionKey: "a",
      pos: "# A\n  - 子".indexOf("子"),
    });
  });
});

describe("locateInSection", () => {
  it("まとめ内の位置を元セクションの位置に戻す", () => {
    const groups = organizeSections([section("a", "# X\n- 1"), section("b", "# X\n- 2")]);
    const { content, ranges } = groups[0]!;
    expect(locateInSection(ranges, content.indexOf("2"))).toEqual({
      sectionKey: "b",
      pos: "# X\n- ".length,
    });
    expect(locateInSection(ranges, 0)).toEqual({ sectionKey: "a", pos: 0 });
  });

  it("つなぎの上なら直前の部分の末尾に寄せる", () => {
    const { content, ranges } = organizeSections([section("a", "# X\n- 1")])[0]!;
    // "# X" の直後のつなぎ (空行)
    expect(locateInSection(ranges, "# X\n".length)).toEqual({ sectionKey: "a", pos: "# X".length });
    expect(content).toBe("# X\n\n- 1");
  });
});

describe("cutRanges", () => {
  it("まとめに含めた範囲を取り除いて残りをつなぐ", () => {
    const content = "- 前\n# A\n- 1\n# B\n- 2";
    const [a] = organizeSections([section("s", content)]);
    const ranges = a!.sources.filter((s) => s.sectionKey === "s");
    expect(cutRanges(content, ranges)).toBe("- 前\n# B\n- 2");
  });

  it("末尾に掛かる削除では区切りの空白も落とす", () => {
    expect(cutRanges("- 前\n\n# A\n- 1", [{ start: 5, end: 12 }])).toBe("- 前");
  });
});
