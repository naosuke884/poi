import { type RefObject, useEffect, useRef, useState } from "react";
import type { EditableSection } from "@/lib/board";
import {
  type RemovedSection,
  removeGroup as removeGroupRanges,
  removeSection as removeSectionAt,
  restoreSections,
} from "@/lib/board-ops";
import type { OrganizedGroup } from "@/lib/organized";

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
  focusLater,
  update,
}: {
  latestRef: RefObject<EditableSection[]>;
  organized: boolean;
  /** 描画後にカーソルを置く (useSectionFocus) */
  focusLater: (key: string, pos: number) => void;
  /** 編集操作の入口 (状態を更新し、自動保存を予約する。useBoardAutosave) */
  update: (next: EditableSection[]) => void;
}) {
  const [deleted, setDeleted] = useState<{
    title: string;
    sections: RemovedSection[];
  } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelUndo = () => {
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    setDeleted(null);
  };
  useEffect(() => () => clearTimeout(undoTimerRef.current ?? undefined), []);
  const showUndo = (title: string, sections: RemovedSection[]) => {
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    setDeleted({ title, sections });
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      setDeleted(null);
    }, UNDO_DELETE_MS);
  };
  const removeSection = (key: string) => {
    const r = removeSectionAt(latestRef.current, key);
    if (!r) return;
    update(r.next);
    showUndo("セクションを削除しました", r.removed);
  };
  // まとめ表示 (#37) の削除: グループに連結した範囲を元の各セクションから取り除く (board-ops)
  const removeGroup = (group: OrganizedGroup) => {
    const r = removeGroupRanges(latestRef.current, group);
    if (!r) return;
    update(r.next);
    const subject = group.heading !== null ? `「${group.heading}」のまとめ` : "見出しなしのまとめ";
    showUndo(`${subject}を削除しました`, r.removed);
  };
  const undoDelete = () => {
    if (!deleted) return;
    cancelUndo();
    const next = restoreSections(latestRef.current, deleted.sections);
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
