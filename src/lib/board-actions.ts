import { useSyncExternalStore } from "react";

export type BoardActions = {
  /** 末尾に空のセクションを足してカーソルを置く */
  addSection: () => void;
};

/**
 * 板の操作をヘッダー (AddSectionButton) に伝えるための小さなストア (save-status と同じ形)。
 * Board (編集できるときだけ) が publishBoardActions で書き、ヘッダーが useBoardActions で読む。
 * null は「板を編集していない」(別ページ、または閲覧のみ) で、ヘッダーにはボタンを出さない
 */
let state: BoardActions | null = null;
const listeners = new Set<() => void>();

export function publishBoardActions(next: BoardActions | null) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => null;

export function useBoardActions(): BoardActions | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
