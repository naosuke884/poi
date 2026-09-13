import { useSyncExternalStore } from "react";

/** 板の表示モード。timeline は通常の板 (編集可)、organized は見出しごとにまとめた表示 (閲覧のみ) */
export type BoardViewMode = "timeline" | "organized";

export type ViewModeState = {
  /** 板を表示中か (ヘッダーに切替 (ViewToggle) を出すか)。閲覧のみ (オフライン) でも true */
  active: boolean;
  mode: BoardViewMode;
};

/**
 * 表示モードの小さなストア (board-actions と同じ形)。
 * mode をコンポーネントの外に置くのは、オンライン復帰などで Board が作り直されても
 * 選んだモードを保つため。Board がマウント中に active を立て、ヘッダーの ViewToggle が読む
 */
let state: ViewModeState = { active: false, mode: "timeline" };
const listeners = new Set<() => void>();

function set(next: ViewModeState) {
  state = next;
  for (const listener of listeners) listener();
}

export function setViewMode(mode: BoardViewMode) {
  if (state.mode !== mode) set({ ...state, mode });
}

export function publishViewToggle(active: boolean) {
  if (state.active !== active) set({ ...state, active });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;

export function useViewMode(): ViewModeState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
