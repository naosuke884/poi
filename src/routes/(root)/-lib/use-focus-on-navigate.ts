import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * 移った先のページの h1 (無ければ本文 #main) にフォーカスを移す。
 * h1 は tabIndex={-1} を付けておく (付いていないとフォーカスできず #main に移る)
 */
export function focusPageStart(main: HTMLElement) {
  const heading = main.querySelector<HTMLElement>("h1");
  // スクロール位置はルーターの復元 (板は Board 自身) に任せる
  heading?.focus({ preventScroll: true });
  if (heading && document.activeElement === heading) return;
  main.focus({ preventScroll: true });
}

/**
 * ページを移ったら、フォーカスを新しいページの先頭 (h1) へ移す (#121)。
 * SPA の遷移ではフォーカスが押したメニュー項目 (消えた要素) や body に残り、スクリーンリーダーでは
 * 移ったことが分からない。見出しに移せば、そのページの名前が読み上げられる。
 * 最初の表示 (fromLocation が無い) と、パスが変わらない遷移 (再読み込み、ハッシュだけの変更) では動かさない
 */
export function useFocusOnNavigate() {
  const router = useRouter();
  useEffect(
    () =>
      router.subscribe("onRendered", ({ fromLocation, pathChanged }) => {
        if (!fromLocation || !pathChanged) return;
        const main = document.getElementById("main");
        if (main) focusPageStart(main);
      }),
    [router],
  );
}
