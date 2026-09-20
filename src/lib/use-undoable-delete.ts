import { type RefObject, useEffect, useRef, useState } from "react";
import { type EditableSection, newSection } from "@/lib/board";
import { type OrganizedGroup, cutRanges } from "@/lib/organized";

// セクションを削除したあと「元に戻す」を出しておく時間
const UNDO_DELETE_MS = 8000;

/**
 * セクション (やまとめのグループ) の削除と「元に戻す」。
 * 削除は即時に反映し (1 秒後に自動保存される)、しばらく「元に戻す」を出す (確認ダイアログの代わり)。
 * 戻すときは元の位置に差し込む。保存が済んだ後なら id は無効になっているが、サーバは未知の id を
 * 新しいセクションとして保存するので内容は戻る (期限だけ新しくなる)。
 * まとめの削除 (removeGroup) は複数セクションに跨がるので、戻す対象はリストで持つ。
 * deleted / cancelUndo / undoDelete は「元に戻す」の Notification (Board の JSX) が使う
 */
export function useUndoableDelete({
  latestRef,
  organized,
  indexOf,
  focusLater,
  update,
}: {
  latestRef: RefObject<EditableSection[]>;
  organized: boolean;
  /** key からセクションの位置を引く */
  indexOf: (key: string) => number;
  /** 描画後にカーソルを置く (useSectionFocus) */
  focusLater: (key: string, pos: number) => void;
  /** 編集操作の入口 (状態を更新し、自動保存を予約する。useBoardAutosave) */
  update: (next: EditableSection[]) => void;
}) {
  const [deleted, setDeleted] = useState<{
    title: string;
    sections: { section: EditableSection; index: number }[];
  } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelUndo = () => {
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    setDeleted(null);
  };
  useEffect(() => () => clearTimeout(undoTimerRef.current ?? undefined), []);
  const showUndo = (
    title: string,
    sections: { section: EditableSection; index: number }[],
  ) => {
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    setDeleted({ title, sections });
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      setDeleted(null);
    }, UNDO_DELETE_MS);
  };
  const removeSection = (key: string) => {
    const cur = latestRef.current;
    const index = indexOf(key);
    const section = cur[index];
    if (!section) return;
    const next = cur.filter((s) => s.key !== key);
    update(next.length > 0 ? next : [newSection()]);
    showUndo("セクションを削除しました", [{ section, index }]);
  };
  // まとめ表示 (#37) の削除: グループに連結した範囲を元の各セクションから取り除く。
  // 取り除いて空になったセクションは丸ごと消す (空のままタイムラインに残っても意味がない)
  const removeGroup = (group: OrganizedGroup) => {
    const bySection = new Map<string, { start: number; end: number }[]>();
    for (const { sectionKey, start, end } of group.sources) {
      const list = bySection.get(sectionKey) ?? [];
      list.push({ start, end });
      bySection.set(sectionKey, list);
    }
    const cur = latestRef.current;
    const affected: { section: EditableSection; index: number }[] = [];
    const next: EditableSection[] = [];
    cur.forEach((section, index) => {
      const ranges = bySection.get(section.key);
      if (!ranges) {
        next.push(section);
        return;
      }
      affected.push({ section, index });
      const content = cutRanges(section.content, ranges);
      if (content.trim() !== "") next.push({ ...section, content });
    });
    if (affected.length === 0) return;
    update(next.length > 0 ? next : [newSection()]);
    const subject =
      group.heading !== null ? `「${group.heading}」のまとめ` : "見出しなしのまとめ";
    showUndo(`${subject}を削除しました`, affected);
  };
  const undoDelete = () => {
    if (!deleted) return;
    cancelUndo();
    const cur = latestRef.current;
    // 最後の 1 つを消して空のセクションだけになっていたら、それは置き換える (書き足していなければ)
    const base =
      cur.length === 1 && cur[0]!.id === null && cur[0]!.content === ""
        ? []
        : cur;
    // まとめの削除で一部だけ取り除いたセクションはまだ残っているので差し替え、
    // 丸ごと消えたものは元の位置に差し込む (位置関係を保つよう index 昇順に)
    const next = [...base];
    for (const d of [...deleted.sections].sort((a, b) => a.index - b.index)) {
      const i = next.findIndex((s) => s.key === d.section.key);
      if (i >= 0) next[i] = d.section;
      else next.splice(Math.min(d.index, next.length), 0, d.section);
    }
    // まとめ表示中はエディタが無いのでフォーカスは予約しない (内容が戻ればよい。
    // 予約するとタイムラインへ戻った拍子に不意にエディタが開いてしまう)。
    // 複数セクションに跨がる削除の取り消しも同様 (どこか 1 つに置いても意味が薄い)
    if (!organized && deleted.sections.length === 1) {
      const { section } = deleted.sections[0]!;
      focusLater(section.key, section.content.length);
    }
    update(next);
  };

  return { deleted, cancelUndo, removeSection, removeGroup, undoDelete };
}
