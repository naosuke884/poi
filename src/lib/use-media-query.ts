import { useSyncExternalStore } from "react";

// matchMedia が無い環境 (プリレンダーの Node、jsdom) では serverValue を返す
const hasMatchMedia = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

/**
 * メディアクエリが一致しているか。変わると再描画する。
 * useEffect で読み直す形にしないのは、初回の描画から実際の値を使いたいため
 * (デモ動画の明暗やスマホ版の選択で、先に違う版を読み込みかけない)。
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

/** OS で「動きを減らす」を選んでいるか */
export const useReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");

/** OS の配色がダークか (配色の切り替えの UI は無く、いつも OS に従う) */
export const usePrefersDark = () => useMediaQuery("(prefers-color-scheme: dark)");
