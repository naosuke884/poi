import { useState } from "react";

import type { EditableSection } from "./data/board";

/** 板に出すセクションの絞り込み: すべて / タグの無いもの / そのタグ (id) の付いたもの */
export type TagFilter = { kind: "all" } | { kind: "untagged" } | { kind: "tag"; tagId: string };

export const ALL_SECTIONS: TagFilter = { kind: "all" };

/**
 * セクションに付いているとして扱うタグの id。registered (登録済みのタグの id) に無い id (別の場所で登録を消された
 * タグ。次の保存でサーバが外す) はタグなし (null) にする。画面に出すタグ・絞り込み・取り直した板との突き合わせで
 * 同じ扱いにするため、どこもこれを通す
 */
export function effectiveTagId(
  tagId: string | null | undefined,
  registered: { has(id: string): boolean },
): string | null {
  return tagId != null && registered.has(tagId) ? tagId : null;
}

/** 絞り込みに当てはまるセクションか (タグは effectiveTagId で見る) */
export function matchesFilter(
  section: { tagId: string | null },
  filter: TagFilter,
  registered: { has(id: string): boolean },
): boolean {
  if (filter.kind === "all") return true;
  const tagId = effectiveTagId(section.tagId, registered);
  if (filter.kind === "untagged") return tagId === null;
  return tagId === filter.tagId;
}

/**
 * key のセクションから dir の向き (-1 が前、1 が後ろ) に見て、fits に当てはまる最初のセクション
 * (絞り込みで隠れているものなどを飛ばす)。key のセクションや当てはまるセクションが無ければ undefined
 */
export function neighborInFilter<T extends { key: string }>(
  sections: T[],
  key: string,
  dir: -1 | 1,
  fits: (s: T) => boolean,
): T | undefined {
  const i = sections.findIndex((s) => s.key === key);
  if (i < 0) return undefined;
  return dir === 1 ? sections.slice(i + 1).find(fits) : sections.slice(0, i).findLast(fits);
}

/**
 * index の位置 (セクションを消した場所) に最も近い、fits に当てはまる (画面に出ている) セクション。
 * index から後ろを先に見て、無ければ前を見る (後ろのセクションが詰まってきた位置を優先する)
 */
export function nearestInFilter<T>(
  sections: T[],
  index: number,
  fits: (s: T) => boolean,
): T | undefined {
  return sections.slice(index).find(fits) ?? sections.slice(0, index).findLast(fits);
}

export function sameFilter(a: TagFilter, b: TagFilter): boolean {
  return a.kind === b.kind && (a.kind !== "tag" || a.tagId === (b as { tagId: string }).tagId);
}

/**
 * 絞り込んでいる間に作った書く場所 (空のセクション) を、その絞り込みに当てはまるようにする:
 * タグで絞り込んでいればそのタグを付け、「タグなし」なら外す。そうしないと、作ったそばから画面から消える
 * (カーソルの行き先が無くなる)。中身のあるセクションのタグは変えない。
 * 空は空文字だけ (untagBlankSections のように空白だけのものを含めない): 対象は appendSection が作った /
 * 使い回した書く場所で、それは常に空文字なので。
 * keys は対象のセクション。変えるものが無ければ sections をそのまま返す
 */
export function fitToFilter(
  sections: EditableSection[],
  keys: ReadonlySet<string>,
  filter: TagFilter,
): EditableSection[] {
  if (filter.kind === "all") return sections;
  const tagId = filter.kind === "tag" ? filter.tagId : null;
  let changed = false;
  const next = sections.map((s) => {
    if (!keys.has(s.key) || s.content !== "" || s.tagId === tagId) return s;
    changed = true;
    return { ...s, tagId };
  });
  return changed ? next : sections;
}

/** 書いていない (空か、空白・改行だけの) セクション。タグのボタンを出さない (SectionRow) ので、タグを選べない */
const isBlank = (s: { content: string }) => s.content.trim() === "";

/**
 * 書いていないセクション (書く場所) のタグを外す。絞り込みを変えたときに呼ぶ: 前の絞り込みの間に作った書く場所が
 * そのタグを持ったまま残ると (タグのボタンが無いので見えず、外せない)、後で書いたメモに選んでいないタグが付く。
 * 新しい絞り込みのタグに付け替えないのは、そのタグのメモが無いときに「まだありません」の代わりに空のカードが出るため
 * (書く場所は「セクションを追加」で、そのとき絞り込みのタグを付けて作る。fitToFilter)。
 * 変えるものが無ければ sections をそのまま返す
 */
export function untagBlankSections(sections: EditableSection[]): EditableSection[] {
  if (!sections.some((s) => isBlank(s) && s.tagId !== null)) return sections;
  return sections.map((s) => (isBlank(s) && s.tagId !== null ? { ...s, tagId: null } : s));
}

// 最後に選んだ絞り込みと、それを選んだユーザー。コンポーネントの外に置くのは、オンライン復帰やページの移動で
// Board が作り直されても選んだ絞り込みを保つため。ユーザーと組で持つのは、同じタブで別のアカウントに
// 切り替えたとき、前のアカウントで選んだ絞り込みで開かないようにするため
let last: { userId: string; filter: TagFilter } | null = null;

/** userId の板の絞り込みとその切り替え (Board が持つ) */
export function useTagFilter(userId: string) {
  const [filter, setFilter] = useState(last?.userId === userId ? last.filter : ALL_SECTIONS);
  const set = (next: TagFilter) => {
    last = { userId, filter: next };
    setFilter(next);
  };
  return [filter, set] as const;
}

/** テスト用: 絞り込みを「すべて」に戻す (モジュールに残るので、テストの間で持ち越さないように) */
export function resetTagFilterForTest() {
  last = null;
}
