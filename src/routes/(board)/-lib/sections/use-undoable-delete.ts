import { type RefObject, useEffect, useRef, useState } from "react";
import type { EditableSection } from "../data/board";
import {
  canRestore,
  type RemovedSection,
  removeGroup as removeGroupRanges,
  removeSection as removeSectionAt,
  restoreSections,
} from "./board-ops";
import type { OrganizedGroup } from "./organized";

// セクションを削除したあと「元に戻す」を出しておく時間 (通知にホバーかフォーカスがある間は数えない)
export const UNDO_DELETE_MS = 8000;

/** 削除の後のフォーカスの扱い (削除ボタンを押した側が決める) */
export type DeleteFocus = {
  /**
   * キーボード (や支援技術) で削除ボタンを押した (click の detail が 0)。
   * 「元に戻す」は DOM の末尾 (Affix) にあって Tab では届かないので、そこへフォーカスを移す
   */
  viaKeyboard: boolean;
  /**
   * 消した場所の前後 (隣のセクションやまとめ) へフォーカスを移す。消したものの中にフォーカスがあった
   * (そのままだと body に落ちる) ときだけ渡す。キーボードで消したときは「元に戻す」の通知を
   * 閉じたときに、それ以外は削除の直後に呼ぶ
   */
  returnFocus: (() => void) | null;
};

/**
 * セクション (やまとめのグループ) の削除と「元に戻す」。
 * 削除は即時に反映し (1 秒後に自動保存される)、しばらく「元に戻す」を出す (確認ダイアログの代わり)。
 * 戻すときは元の位置に差し込む。保存が済んだ後なら id は無効になっているが、サーバは未知の id を
 * 新しいセクションとして保存するので内容は戻る (期限だけ新しくなる)。
 * まとめの削除 (removeGroup) は複数セクションに跨がるので、戻す対象はリストで持つ。
 * 一部だけ削ったセクションをその後に編集したら、戻すとその編集が消えるので「元に戻す」は出さない (canRestore)。
 * 通知にホバーかフォーカスがある間は消えるまでの時間を止め、離れたら数え直す (holdUndo。#112)。
 * deleted / closeUndo / undoDelete / holdUndo は「元に戻す」の通知 (Board の JSX) が使う
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
    /** 描画したら「元に戻す」にフォーカスを移す (キーボードで削除した) */
    focusUndo: boolean;
  } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 通知にホバー / フォーカスがあるか (どちらかがあれば時間を止める)
  const holdRef = useRef({ hover: false, focus: false });
  // 「元に戻す」にフォーカスを移したとき、通知を閉じたら戻る先
  const returnFocusRef = useRef<(() => void) | null>(null);
  const stopTimer = () => {
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
  };
  const startTimer = () => {
    stopTimer();
    if (holdRef.current.hover || holdRef.current.focus) return;
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      returnFocusRef.current = null;
      setDeleted(null);
    }, UNDO_DELETE_MS);
  };
  const cancelUndo = () => {
    stopTimer();
    // 通知ごと消えるので、ホバー / フォーカスも無くなる (消える要素からは blur が届かないことがある)
    holdRef.current = { hover: false, focus: false };
    returnFocusRef.current = null;
    setDeleted(null);
  };
  useEffect(() => () => clearTimeout(undoTimerRef.current ?? undefined), []);
  const showUndo = (title: string, sections: RemovedSection[], focus: DeleteFocus) => {
    setDeleted({ title, sections, focusUndo: focus.viaKeyboard });
    returnFocusRef.current = focus.viaKeyboard ? focus.returnFocus : null;
    if (!focus.viaKeyboard) focus.returnFocus?.();
    startTimer();
  };
  const removeSection = (key: string, focus: DeleteFocus) => {
    const r = removeSectionAt(latestRef.current, key);
    if (!r) return;
    update(r.next);
    showUndo("セクションを削除しました", r.removed, focus);
  };
  // まとめ表示 (#37) の削除: グループに連結した範囲を元の各セクションから取り除く (board-ops)
  const removeGroup = (group: OrganizedGroup, focus: DeleteFocus) => {
    const r = removeGroupRanges(latestRef.current, group);
    if (!r) return;
    update(r.next);
    const subject = group.heading !== null ? `「${group.heading}」のまとめ` : "見出しなしのまとめ";
    showUndo(`${subject}を削除しました`, r.removed, focus);
  };
  // 通知へのホバー / フォーカスの出入り。どちらも無くなったら、また UNDO_DELETE_MS 数える
  const holdUndo = (kind: "hover" | "focus", on: boolean) => {
    holdRef.current = { ...holdRef.current, [kind]: on };
    if (on) stopTimer();
    else if (deleted) startTimer();
  };
  // × (や Esc) で閉じる。通知の中にフォーカスがあったなら、削除した場所の前後へ戻す
  // (そのままだと通知と一緒に消えて body に落ちる)
  const closeUndo = () => {
    const back = holdRef.current.focus ? returnFocusRef.current : null;
    cancelUndo();
    back?.();
  };
  // 対象のセクションが編集されて戻せなくなったら出さない (編集を取り消して戻れば、また出る)。
  // 描画のたびに今の内容で確かめる (編集は必ず Board の再描画を伴う)
  const undoable = deleted && canRestore(latestRef.current, deleted.sections) ? deleted : null;
  const undoDelete = () => {
    if (!deleted || !canRestore(latestRef.current, deleted.sections)) return;
    const back = holdRef.current.focus ? returnFocusRef.current : null;
    cancelUndo();
    const next = restoreSections(latestRef.current, deleted.sections);
    // まとめ表示中はエディタが無いのでフォーカスは予約しない (内容が戻ればよい。
    // 予約するとタイムラインへ戻った拍子に不意にエディタが開いてしまう)。
    // 複数セクションに跨がる削除の取り消しも同様 (どこか 1 つに置いても意味が薄い)。
    // そのときも「元に戻す」を押したフォーカスは通知と一緒に消えるので、削除した場所の前後へ戻す
    if (!organized && deleted.sections.length === 1) {
      const { section } = deleted.sections[0]!;
      focusLater(section.key, section.content.length);
    } else {
      back?.();
    }
    update(next);
  };

  return { deleted: undoable, closeUndo, holdUndo, removeSection, removeGroup, undoDelete };
}
