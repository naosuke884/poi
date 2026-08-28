import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

/**
 * navigator.onLine を online / offline イベントで追従する。
 * false は「確実にオフライン」、true は「オフラインとは分からない」程度の意味
 * (Wi-Fi に繋がっていてもインターネットに出られないケースは true のまま)。
 * 実際に通信できるかは fetch の失敗 (OfflineError) で判断する。
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
