import { BOARD_MAX_LENGTH, SECTION_SEPARATOR } from "@shared/constants";

import { type EditableSection, newSection } from "../data/board";
import { effectiveTagId } from "../tag-filter";

/**
 * 板のセクション配列の編集操作 (React や DOM に触らない純粋関数)。
 * Board / useUndoableDelete はここで次の配列とカーソルの行き先を求め、フォーカスの予約と
 * update (状態の更新 + 自動保存の予約) だけを行う。
 *
 * key と id の引き継ぎ規則: 結合では key (= 画面上のエディタの DOM) はフォーカスのある方に、
 * id / createdAt / expiresAt (= サーバ上の行と期限) は前のセクションに (前が未保存なら後ろのものを) 付ける。フォーカスのある
 * エディタを作り直さずに済ませるため (作り直すとタッチ端末でキーボードが閉じる)。
 *
 * タグの引き継ぎ規則: 結合では、前のセクションのタグを残す (前に無ければ後ろのタグ)
 */

/** カーソルを置く先 (描画後に置く) */
export type FocusTarget = { key: string; offset: number };

/** 削除して「元に戻す」で差し戻すセクションと、その元の位置 */
export type RemovedSection = { section: EditableSection; index: number };

/** セクションが 1 つも無くならないようにする (板には常に書く場所を 1 つ残す) */
const nonEmpty = (sections: EditableSection[]) => (sections.length > 0 ? sections : [newSection()]);

/**
 * key のセクションに書ける文字数。板全体の上限 (保存するのは空でないセクションを区切りで連結したもの。boardLength) から、
 * 他の空でないセクションの文字数と、それらとの区切りのぶんを引く。key が無ければ他のすべてを数える
 */
export function sectionMaxLength(sections: EditableSection[], key: string): number {
  let othersLength = 0;
  let others = 0;
  for (const s of sections) {
    if (s.key === key || s.content === "") continue;
    othersLength += s.content.length;
    others++;
  }
  return BOARD_MAX_LENGTH - othersLength - others * SECTION_SEPARATOR.length;
}

/**
 * key のセクションの入力を反映する。空行をいくつ続けても分けない (セクションは追加ボタンで増やす)。
 * key が無ければ null
 */
export function changeSection(
  cur: EditableSection[],
  key: string,
  value: string,
): EditableSection[] | null {
  if (!cur.some((s) => s.key === key)) return null;
  return cur.map((s) => (s.key === key ? { ...s, content: value } : s));
}

/**
 * i 番目と i+1 番目をつなげる。前のセクションが id (期限) を保ち、フォーカスのある方 (focusedKey) が
 * key を保つ。前がまだ保存していない (id が無い) セクションなら、後ろの id (期限) を保つ (前の id を取ると、
 * 後ろの保存済みの行は消され、同じ内容が新しい期限で作り直される: 期限は延びない、を破る)。
 * カーソルはつなぎ目に置く。どちらかが無ければ null
 */
export function mergeSections(
  cur: EditableSection[],
  i: number,
  focusedKey: string,
  registered: { has(id: string): boolean },
): { next: EditableSection[]; focus: FocusTarget } | null {
  const a = cur[i];
  const b = cur[i + 1];
  if (!a || !b) return null;
  const saved = a.id !== null ? a : b;
  const merged: EditableSection = {
    key: focusedKey,
    id: saved.id,
    createdAt: saved.createdAt,
    expiresAt: saved.expiresAt,
    content: a.content + b.content,
    // 画面に出ているタグを残す (登録に無い id は、画面ではタグなしなので後ろのタグを優先する)
    tagId: effectiveTagId(a.tagId, registered) ?? effectiveTagId(b.tagId, registered),
  };
  return {
    next: [...cur.slice(0, i), merged, ...cur.slice(i + 2)],
    focus: { key: focusedKey, offset: a.content.length },
  };
}

/**
 * 末尾に空のセクションを足してカーソルを置く先を返す。
 * 末尾が既に空 (完全に空文字。空白だけのセクションは保存されて期限を持っているので使い回さない)
 * ならそれを使う (next は null: 配列は変わらない)
 */
export function appendSection(cur: EditableSection[]): {
  next: EditableSection[] | null;
  focus: FocusTarget;
} {
  const last = cur.at(-1);
  if (last && last.content === "") return { next: null, focus: { key: last.key, offset: 0 } };
  const s = newSection();
  return { next: [...cur, s], focus: { key: s.key, offset: 0 } };
}

/** key のセクションを取り除く。最後の 1 つなら空のセクションに置き換える。key が無ければ null */
export function removeSection(
  cur: EditableSection[],
  key: string,
): { next: EditableSection[]; removed: RemovedSection } | null {
  const index = cur.findIndex((s) => s.key === key);
  const section = cur[index];
  if (!section) return null;
  return {
    next: nonEmpty(cur.filter((s) => s.key !== key)),
    removed: { section, index },
  };
}

/**
 * 削除したセクションを元の位置に差し込んで戻す (その後に板が縮んでいれば末尾に)。
 * 最後の 1 つを消して空のセクションだけになっていたら、それは置き換える (書き足していなければ)
 */
export function restoreSection(
  cur: EditableSection[],
  { section, index }: RemovedSection,
): EditableSection[] {
  const base = cur.length === 1 && cur[0]!.id === null && cur[0]!.content === "" ? [] : cur;
  return base.toSpliced(Math.min(index, base.length), 0, section);
}
