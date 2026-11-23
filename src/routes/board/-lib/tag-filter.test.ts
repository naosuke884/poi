import { describe, expect, it } from "vite-plus/test";

import type { EditableSection } from "./data/board";
import {
  fitToFilter,
  matchesFilter,
  nearestInFilter,
  neighborInFilter,
  type TagFilter,
  untagBlankSections,
} from "./tag-filter";

const section = (key: string, content: string, tagId: string | null = null): EditableSection => ({
  key,
  id: null,
  content,
  tagId,
  createdAt: null,
  expiresAt: null,
});

/** 登録済みのタグ (id) */
const registered = new Set(["shop", "home"]);
const shopping: TagFilter = { kind: "tag", tagId: "shop" };

describe("matchesFilter", () => {
  it("「すべて」はどれも、「タグなし」はタグの無いものだけ、タグはそのタグの付いたものだけ", () => {
    const tagged = { tagId: "shop" };
    const untagged = { tagId: null };
    const all = [tagged, untagged];
    expect(all.map((s) => matchesFilter(s, { kind: "all" }, registered))).toEqual([true, true]);
    expect(all.map((s) => matchesFilter(s, { kind: "untagged" }, registered))).toEqual([
      false,
      true,
    ]);
    expect(matchesFilter(tagged, shopping, registered)).toBe(true);
    expect(matchesFilter(tagged, { kind: "tag", tagId: "home" }, registered)).toBe(false);
    expect(matchesFilter(untagged, shopping, registered)).toBe(false);
  });

  it("登録に無いタグ (別の場所で登録を消された) の付いたセクションは、タグなしとして扱う", () => {
    const orphan = { tagId: "gone" };
    expect(matchesFilter(orphan, { kind: "untagged" }, registered)).toBe(true);
    expect(matchesFilter(orphan, { kind: "tag", tagId: "gone" }, registered)).toBe(false);
  });
});

describe("fitToFilter", () => {
  const sections = [section("a", "x", "home"), section("b", ""), section("c", "", "home")];
  const tags = (next: EditableSection[]) => next.map((s) => s.tagId);

  it("タグで絞り込んでいれば、対象の空のセクションにそのタグを付ける (中身のあるものは変えない)", () => {
    const next = fitToFilter(sections, new Set(["a", "b"]), shopping);
    expect(tags(next)).toEqual(["home", "shop", "home"]);
  });

  it("「タグなし」で絞り込んでいれば、対象の空のセクションからタグを外す", () => {
    expect(tags(fitToFilter(sections, new Set(["c"]), { kind: "untagged" }))).toEqual([
      "home",
      null,
      null,
    ]);
  });

  it("「すべて」のときと、変えるものが無いときは、同じ配列を返す", () => {
    expect(fitToFilter(sections, new Set(["b"]), { kind: "all" })).toBe(sections);
    expect(fitToFilter(sections, new Set(["c"]), { kind: "tag", tagId: "home" })).toBe(sections);
  });
});

describe("neighborInFilter / nearestInFilter", () => {
  const sections = [
    section("a", "a", "shop"),
    section("b", "b"),
    section("c", "", "shop"),
    section("d", "d", "shop"),
  ];
  const fits = (filter: TagFilter) => (s: EditableSection) => matchesFilter(s, filter, registered);

  it("隣を探すときは、fits に当てはまらないもの (絞り込みで隠れているものなど) を飛ばす", () => {
    expect(neighborInFilter(sections, "a", 1, fits(shopping))?.key).toBe("c");
    expect(
      neighborInFilter(sections, "a", 1, (s) => fits(shopping)(s) && s.content !== "")?.key,
    ).toBe("d");
    expect(neighborInFilter(sections, "d", -1, fits({ kind: "untagged" }))?.key).toBe("b");
    expect(neighborInFilter(sections, "a", -1, fits(shopping))).toBeUndefined();
    expect(neighborInFilter(sections, "無い", 1, fits(shopping))).toBeUndefined();
  });

  it("消した場所に近いものは、後ろを先に、無ければ前を探す (当てはまらないものは飛ばす)", () => {
    expect(nearestInFilter(sections, 1, fits(shopping))?.key).toBe("c");
    expect(nearestInFilter(sections, 4, fits(shopping))?.key).toBe("d");
    expect(nearestInFilter(sections, 2, fits({ kind: "untagged" }))?.key).toBe("b");
    expect(nearestInFilter(sections, 0, fits({ kind: "tag", tagId: "home" }))).toBeUndefined();
  });
});

describe("untagBlankSections", () => {
  it("書いていない (空か空白・改行だけの) セクションのタグだけを外す", () => {
    const sections = [
      section("a", "", "shop"),
      section("b", "\n", "home"),
      section("c", "c", "shop"),
    ];
    expect(untagBlankSections(sections).map((s) => s.tagId)).toEqual([null, null, "shop"]);
  });

  it("外すものが無ければ同じ配列を返す", () => {
    const sections = [section("a", ""), section("b", "b", "shop")];
    expect(untagBlankSections(sections)).toBe(sections);
  });
});
