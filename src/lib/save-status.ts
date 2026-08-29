import { useSyncExternalStore } from "react";

export type SaveStatus =
  | "dirty" // 未保存の変更がある (debounce 待ち)
  | "saving"
  | "saved"
  | "offline" // オフラインで保存できなかった (入力は保持。online イベントか再試行で再送する)
  | "error";

export type SaveState = {
  status: SaveStatus;
  errorMessage: string | null;
  /** offline / error のときに保存をやり直す */
  retry: () => void;
};

/**
 * 板の保存状態をヘッダー (SaveStatusIcon) に伝えるための小さなストア。
 * Board (編集中のときだけ) が publishSaveState で書き、ヘッダーが useSaveState で読む。
 * null は「板を編集していない」(別ページ、または閲覧のみ) で、ヘッダーには何も出さない
 */
let state: SaveState | null = null;
const listeners = new Set<() => void>();

export function publishSaveState(next: SaveState | null) {
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

export function useSaveState(): SaveState | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
