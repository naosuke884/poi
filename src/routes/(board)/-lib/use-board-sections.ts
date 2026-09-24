import { useCallback, useRef, useState } from "react";
import {
  type BoardSection,
  type EditableSection,
  newSection,
  toEditable,
} from "@/routes/-lib/board";
import { useBoardAutosave } from "./use-board-autosave";

/**
 * 板の画面上のセクションと、その唯一の編集入口 update。
 * - sections は描画用の state。ハンドラや保存処理は常に latestRef (同じ内容で、描画を待たずに最新) を読む
 * - 編集操作はすべて update を通す (状態を更新し、自動保存を予約する。useBoardAutosave)
 * 削除 (useUndoableDelete) やフォーカス (useSectionFocus) はここから latestRef / update を受け取る側
 */
export function useBoardSections({
  initial,
  initialRevision,
  userId,
  readOnly,
  ttlDays,
}: {
  initial: BoardSection[];
  initialRevision: string | null;
  userId: string;
  readOnly: boolean;
  ttlDays: number;
}) {
  const [sections, setSections] = useState<EditableSection[]>(() => {
    const s = toEditable(initial);
    return s.length > 0 ? s : [newSection()];
  });
  const latestRef = useRef(sections);

  // 画面の状態を差し替える (自動保存は予約しない: 保存後にサーバの id を戻すときなど)
  const commit = useCallback((next: EditableSection[]) => {
    latestRef.current = next;
    setSections(next);
  }, []);

  const { update } = useBoardAutosave({
    initial,
    initialRevision,
    userId,
    readOnly,
    ttlDays,
    latestRef,
    commit,
  });

  return { sections, latestRef, update };
}
