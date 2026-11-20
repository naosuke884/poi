import { useSyncExternalStore } from "react";

// matchMedia が無い環境 (プリレンダーの Node、jsdom) では serverValue を返す
const hasMatchMedia = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

/**
 * メディアクエリが一致しているか。変わると再描画する。
 * useEffect で読み直す形にしないのは、初回の描画から実際の値を使いたいため
 * (描いた後に直すと、違う値の表示が一度出てしまう)。
 * ハイドレーション中だけは serverValue を使い、プリレンダーの HTML と食い違わないようにする
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (!hasMatchMedia()) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => (hasMatchMedia() ? window.matchMedia(query).matches : serverValue),
    () => serverValue,
  );
}
