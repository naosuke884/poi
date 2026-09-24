import { createExternalStore } from "./external-store";

/** 板の表示モード。timeline は通常の板 (編集可)、organized は見出しごとにまとめた表示 (閲覧のみ) */
export type BoardViewMode = "timeline" | "organized";

export type ViewModeState = {
  /** 板を表示中か (ヘッダーに切替 (ViewToggle) を出すか)。閲覧のみ (オフライン) でも true */
  active: boolean;
  mode: BoardViewMode;
};

/**
 * 表示モードの小さなストア。
 * mode をコンポーネントの外に置くのは、オンライン復帰などで Board が作り直されても
 * 選んだモードを保つため。Board がマウント中に active を立て、ヘッダーの ViewToggle が読む
 */
const store = createExternalStore<ViewModeState>({ active: false, mode: "timeline" });

export function setViewMode(mode: BoardViewMode) {
  const state = store.get();
  if (state.mode !== mode) store.set({ ...state, mode });
}

export function publishViewToggle(active: boolean) {
  const state = store.get();
  if (state.active !== active) store.set({ ...state, active });
}

export function useViewMode(): ViewModeState {
  return store.useValue();
}
