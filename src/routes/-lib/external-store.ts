import { useSyncExternalStore } from "react";

/**
 * Board とヘッダーの間で値を受け渡すための小さな useSyncExternalStore 用ストアの共通形
 * (save-status / board-actions / view-mode)。
 * serverSnapshot を渡すと SSR ではその値を返す (省略時はクライアントと同じスナップショット)
 */
export function createExternalStore<T>(initial: T, serverSnapshot?: () => T) {
  let state = initial;
  const listeners = new Set<() => void>();

  function set(next: T) {
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
  const getServerSnapshot = serverSnapshot ?? getSnapshot;

  function useValue(): T {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  }

  return { get: getSnapshot, set, useValue };
}
