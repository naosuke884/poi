import { type EditableSection, newKey, newSection, splitAtSeparator } from "../board";
import { cutRanges, type OrganizedGroup } from "./organized";

/**
 * 板のセクション配列の編集操作 (React や DOM に触らない純粋関数)。
 * Board / useUndoableDelete はここで次の配列とカーソルの行き先を求め、フォーカスの予約と
 * update (状態の更新 + 自動保存の予約) だけを行う。
 *
 * key と id の引き継ぎ規則: key (= 画面上のエディタの DOM) はフォーカスのある部分に、
 * id / createdAt / expiresAt (= サーバ上の行と期限) は先頭の部分に付ける。分割 / 結合でフォーカスのある
 * エディタを作り直さずに済ませるため (作り直すとタッチ端末でキーボードが閉じる)
 */

/** カーソルを置く先 (描画後に置く) */
export type FocusTarget = { key: string; offset: number };

/**
 * 削除して「元に戻す」で差し戻すセクションと、その元の位置。
 * remaining は一部だけ削って残したときの、削った後の内容 (丸ごと消したときは null)
 */
export type RemovedSection = { section: EditableSection; index: number; remaining: string | null };

/** セクションが 1 つも無くならないようにする (板には常に書く場所を 1 つ残す) */
const nonEmpty = (sections: EditableSection[]) => (sections.length > 0 ? sections : [newSection()]);

/**
 * key のセクションの入力を反映する。区切り (空行 2 つ) が入っていたらそこで分ける。
 * focus は分けたときのカーソルの行き先 (分けなければ null)、
 * revealLast は末尾に新しいセクションができてそこへ移る (冒頭を画面の上端へ出したい) とき true。
 * key が無ければ null
 */
export function changeSection(
  cur: EditableSection[],
  key: string,
  value: string,
  cursor: number,
): { next: EditableSection[]; focus: FocusTarget | null; revealLast: boolean } | null {
  const i = cur.findIndex((s) => s.key === key);
  const orig = cur[i];
  if (!orig) return null;
  const split = splitAtSeparator(value, cursor);
  if (!split) {
    return {
      next: cur.map((s) => (s.key === key ? { ...s, content: value } : s)),
      focus: null,
      revealLast: false,
    };
  }
  // 最初の部分が id (期限) を引き継ぎ、カーソルの行き先の部分が key を引き継ぐ。残りは新しいセクション
  const parts = split.parts.map(
    (content, j): EditableSection => ({
      key: j === split.focus.index ? orig.key : newKey(),
      id: j === 0 ? orig.id : null,
      createdAt: j === 0 ? orig.createdAt : null,
      expiresAt: j === 0 ? orig.expiresAt : null,
      content,
    }),
  );
  return {
    next: [...cur.slice(0, i), ...parts, ...cur.slice(i + 1)],
    focus: { key: orig.key, offset: split.focus.offset },
    revealLast: i === cur.length - 1 && split.focus.index === parts.length - 1,
  };
}

/**
 * i 番目と i+1 番目をつなげる。前のセクションが id (期限) を保ち、フォーカスのある方 (focusedKey) が
 * key を保つ。カーソルはつなぎ目に置く。どちらかが無ければ null
 */
export function mergeSections(
  cur: EditableSection[],
  i: number,
  focusedKey: string,
): { next: EditableSection[]; focus: FocusTarget } | null {
  const a = cur[i];
  const b = cur[i + 1];
  if (!a || !b) return null;
  const merged: EditableSection = {
    key: focusedKey,
    id: a.id,
    createdAt: a.createdAt,
    expiresAt: a.expiresAt,
    content: a.content + b.content,
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
): { next: EditableSection[]; removed: RemovedSection[] } | null {
  const index = cur.findIndex((s) => s.key === key);
  const section = cur[index];
  if (!section) return null;
  return {
    next: nonEmpty(cur.filter((s) => s.key !== key)),
    removed: [{ section, index, remaining: null }],
  };
}

/**
 * まとめ表示 (#37) の削除: グループに連結した範囲を元の各セクションから取り除く。
 * 取り除いて空になったセクションは丸ごと消す (空のままタイムラインに残っても意味がない)。
 * removed は手を入れたセクションの元の姿 (一部だけ削ったものも含む)。どれにも当たらなければ null
 */
export function removeGroup(
  cur: EditableSection[],
  group: OrganizedGroup,
): { next: EditableSection[]; removed: RemovedSection[] } | null {
  const bySection = new Map<string, { start: number; end: number }[]>();
  for (const { sectionKey, start, end } of group.sources) {
    const list = bySection.get(sectionKey) ?? [];
    list.push({ start, end });
    bySection.set(sectionKey, list);
  }
  const removed: RemovedSection[] = [];
  const next: EditableSection[] = [];
  cur.forEach((section, index) => {
    const ranges = bySection.get(section.key);
    if (!ranges) {
      next.push(section);
      return;
    }
    const content = cutRanges(section.content, ranges);
    const kept = content.trim() !== "";
    removed.push({ section, index, remaining: kept ? content : null });
    if (kept) next.push({ ...section, content });
  });
  if (removed.length === 0) return null;
  return { next: nonEmpty(next), removed };
}

/**
 * 削除をまだ元に戻せるか: 一部だけ削って残したセクションが、その後に編集されていない (削った直後の内容のまま)。
 * 編集されていたら戻せない (元の姿に差し替えると、その後の編集が消えてしまう)
 */
export function canRestore(cur: EditableSection[], removed: RemovedSection[]): boolean {
  return removed.every(
    (d) =>
      d.remaining === null || cur.some((s) => s.key === d.section.key && s.content === d.remaining),
  );
}

/**
 * 削除したセクションを戻す (canRestore を確かめてから呼ぶ)。一部だけ削って残っているセクションは元の内容に戻し、
 * 丸ごと消えたものは元の位置に差し込む (位置関係を保つよう index 昇順に)。
 * 最後の 1 つを消して空のセクションだけになっていたら、それは置き換える (書き足していなければ)
 */
export function restoreSections(
  cur: EditableSection[],
  removed: RemovedSection[],
): EditableSection[] {
  const base = cur.length === 1 && cur[0]!.id === null && cur[0]!.content === "" ? [] : cur;
  const next = [...base];
  for (const d of [...removed].sort((a, b) => a.index - b.index)) {
    const i = next.findIndex((s) => s.key === d.section.key);
    // 残っているものは内容だけ戻す (id / 期限は保存で付いた今のもの)
    if (i >= 0) next[i] = { ...next[i]!, content: d.section.content };
    else next.splice(Math.min(d.index, next.length), 0, d.section);
  }
  return next;
}
