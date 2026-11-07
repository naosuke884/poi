import "./fonts.css";
import "./tokens.css";
import "./global.css";
import { createRouter, type RouterHistory, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";

import { RouteErrorFallback } from "./RouteErrorFallback";
import { routeTree } from "./routeTree.gen";

// アプリの木 (ルーター)。ブラウザ (main.tsx) と、ビルド時にランディングを HTML にする
// プリレンダー (prerender.tsx。issue #157) の両方が使うので、ブラウザでしか動かない処理はここに置かない

/** ssr: ビルド時のプリレンダー用 (src/prerender.tsx)。スクロール位置を戻すインラインスクリプトを HTML に出さない (CSP の script-src 'self' に引っかかる) */
export function createAppRouter(history?: RouterHistory, { ssr = false } = {}) {
  return createRouter({
    routeTree,
    history,
    defaultPreload: "intent",
    // 板 (/board) 以外はスクロール位置を復元する (履歴で戻ったときなど)。
    // 板は Board が描画後に最後のセクションの冒頭へスクロールするので、ルーターには触らせない
    // (true だと onRendered で保存位置 or 先頭へ scrollTo され、Board のスクロールが上書きされる)
    scrollRestoration: ssr ? false : ({ location }) => location.pathname !== "/board",
    // loader / beforeLoad の例外 (オフラインでキャッシュも無い場合など) の共通表示
    defaultErrorComponent: RouteErrorFallback,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}

/** ルーターを含むアプリ全体。router は load() を済ませてから渡す (プリレンダーとハイドレーションで同じ描画にするため) */
export function App({ router }: { router: ReturnType<typeof createAppRouter> }) {
  return (
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
}
