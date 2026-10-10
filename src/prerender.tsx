import { PRERENDERED_PAGES } from "@shared/site";
import { createMemoryHistory } from "@tanstack/react-router";
import { renderToString } from "react-dom/server";

import { App, createAppRouter } from "./app";

export type PrerenderedPage = {
  /** dist/client に出すファイル名 */
  file: string;
  /** #root に入れる HTML */
  markup: string;
  /** 描いたルートの id ("/(docs)/guide" の形)。そのルートのチャンクの CSS を探すのに使う */
  routeId: string;
};

/**
 * ビルド時に Node で呼び、ランディングや使い方などのページを HTML にする (vite-plugins/prerender-pages.ts。issue #157)。
 * 未ログインで初めて開いた人と同じ描画 (ヘッダーのユーザーメニューはセッション確認中の表示) になる。
 * ブラウザでは main.tsx が同じものを描いて置き換える
 */
export async function renderPages(): Promise<PrerenderedPage[]> {
  const pages: PrerenderedPage[] = [];
  for (const [pathname, file] of Object.entries(PRERENDERED_PAGES)) {
    const router = createAppRouter(createMemoryHistory({ initialEntries: [pathname] }), {
      ssr: true,
    });
    await router.load();
    const routeId = router.state.matches.at(-1)!.routeId;
    pages.push({ file, markup: renderToString(<App router={router} />), routeId });
  }
  return pages;
}
