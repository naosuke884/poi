import "./mantine-styles";
import "./fonts.css";
// Mantine の CSS より後に読み込む (同じ要素への指定は後のものが勝つ)
import "./tokens.css";
import "./global.css";
import { type CSSVariablesResolver, createTheme, MantineProvider } from "@mantine/core";
import { createRouter, type RouterHistory, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";

import { RouteErrorFallback } from "./RouteErrorFallback";
import { routeTree } from "./routeTree.gen";

// アプリの木 (テーマ + ルーター)。ブラウザ (main.tsx) と、ビルド時にランディングを HTML にする
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

// 色と文字の値は tokens.css にある。ここでは Mantine の部品がそれを使うように向けるだけ。
// 藍のパレットは Mantine の部品の color="ai" 用 (塗りの 6 番 / ダークの 7 番は tokens.css の --poi-color-primary と同じ)
const theme = createTheme({
  // 変数にしておくと、デモ動画の録画 (scripts/record-demo-video.mjs) が 1 か所の上書きで両方の字形を替えられる
  fontFamily: "var(--poi-font-family)",
  colors: {
    ai: [
      "#eff3fa",
      "#dde4f4",
      "#bccae7",
      "#97add8",
      "#7390c9",
      "#4b6fb9",
      "#3a5a9b",
      "#314b82",
      "#283e6c",
      "#203255",
    ],
  },
  primaryColor: "ai",
  primaryShade: { light: 6, dark: 7 },
  // 見出しが折り返すとき、各行の長さを揃える (最後の行が 1 文字だけになるのを防ぐ)。
  // 行数は変わらないので、板の見出しの表示と編集の高さの一致は崩れない。未対応のブラウザは通常の折り返し
  headings: { textWrap: "balance", fontFamily: "var(--poi-font-family)" },
  components: {
    // モーダルの見出し部分: Mantine は <header> で描画し、axe などはページの banner ランドマーク (2 つ目) と
    // みなす (ページのヘッダーと区別できない)。ランドマークにしないよう div にする
    ModalHeader: { defaultProps: { component: "div" } },
    // モーダルの × ボタンには既定で名前が無い (アイコンだけ)。読み上げで何のボタンか分かるようにする
    ModalCloseButton: { defaultProps: { "aria-label": "閉じる" } },
  },
});

// 控えめな文字 (c="dimmed")・プレースホルダー・赤の文字 (c="red" など) は、コントラストを AA に上げた tokens.css の色にする
// (理由は tokens.css)。Mantine 既定の dimmed は白地で 3.3、ダークの #242424 地で 4.0 しかない
const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    "--mantine-color-dimmed": "var(--poi-color-dimmed)",
    "--mantine-color-placeholder": "var(--poi-color-placeholder)",
    "--mantine-color-red-text": "var(--poi-color-danger)",
    "--mantine-color-red-outline": "var(--poi-color-danger-outline)",
  },
  dark: {
    "--mantine-color-dimmed": "var(--poi-color-dimmed)",
    "--mantine-color-placeholder": "var(--poi-color-placeholder)",
  },
});

/** テーマとルーターを含むアプリ全体。router は load() を済ませてから渡す (プリレンダーとハイドレーションで同じ描画にするため) */
export function App({ router }: { router: ReturnType<typeof createAppRouter> }) {
  return (
    <StrictMode>
      <MantineProvider
        theme={theme}
        defaultColorScheme="auto"
        cssVariablesResolver={cssVariablesResolver}
      >
        <RouterProvider router={router} />
      </MantineProvider>
    </StrictMode>
  );
}
