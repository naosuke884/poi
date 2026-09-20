import { useEffect, useRef, useSyncExternalStore } from "react";

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

/**
 * オフライン → オンラインに戻った瞬間 (エッジ) にだけ callback を呼ぶ。
 * callback は ref で持つので、毎レンダー新しい関数を渡しても effect は online の変化でしか走らない
 * (呼ばれるときは最新のレンダーの値を見る)。
 */
export function useOnBackOnline(callback: () => void) {
  const online = useOnline();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const wasOffline = useRef(!online);
  useEffect(() => {
    if (online && wasOffline.current) callbackRef.current();
    wasOffline.current = !online;
  }, [online]);
}
