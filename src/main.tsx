import "./mantine-styles";
import "./fonts.css";
import { type CSSVariablesResolver, createTheme, MantineProvider } from "@mantine/core";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouteErrorFallback } from "./RouteErrorFallback";
// ホーム画面への追加 (beforeinstallprompt) は React のマウントより先に飛んでくることがあるので、
// 受け取り口をここで先に用意しておく (副作用だけの import)
import "@/lib/install-prompt";
import { removeByPrefix } from "@/lib/local-storage";
import { pruneBoardCaches } from "@/lib/offline-caches";
import { routeTree } from "./routeTree.gen";

// セクションの折り畳み機能は 2026-09 に廃止した (#51)。端末ごとに localStorage へ
// 記録していた頃の残りを消す (しばらく経ったらこの行ごと消してよい)
removeByPrefix("poi:collapsed:v1:");
// オフライン用の板のキャッシュから、期限を過ぎたセクションの本文を消す (issue #115)
pruneBoardCaches();

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  // 板 (/) 以外はスクロール位置を復元する (履歴で戻ったときなど)。
  // 板は Board が描画後に最後のセクションの冒頭へスクロールするので、ルーターには触らせない
  // (true だと onRendered で保存位置 or 先頭へ scrollTo され、Board のスクロールが上書きされる)
  scrollRestoration: ({ location }) => location.pathname !== "/",
  // loader / beforeLoad の例外 (オフラインでキャッシュも無い場合など) の共通表示
  defaultErrorComponent: RouteErrorFallback,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// 欧文は Inter、日本語などそれ以外の文字は各環境のシステムフォントに任せる (fonts.css)。
// 主要色は藍 (ai、6 番 = #3a5a9b。アイコン public/icon.svg などと同じ色。issue #96)。
// Mantine 既定の青は白い文字とのコントラストが AA (4.5) に届かない (藍の 6 番は 6.7)。
// ダークでは塗りの色を 7 番にする (既定の 8 番だと暗い背景 #242424 に沈む)
const theme = createTheme({
  fontFamily: '"Inter Variable", system-ui, sans-serif',
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
  headings: { textWrap: "balance" },
  components: {
    // モーダルの見出し部分: Mantine は <header> で描画し、axe などはページの banner ランドマーク (2 つ目) と
    // みなす (ページのヘッダーと区別できない)。ランドマークにしないよう div にする
    ModalHeader: { defaultProps: { component: "div" } },
    // モーダルの × ボタンには既定で名前が無い (アイコンだけ)。読み上げで何のボタンか分かるようにする
    ModalCloseButton: { defaultProps: { "aria-label": "閉じる" } },
  },
});

// 控えめな文字 (c="dimmed") とプレースホルダーの色。Mantine 既定の dimmed は白地で 3.3 (gray 6)、
// ダークの #242424 地で 4.0 (dark 2) と、小さな文字の AA (4.5) に届かない (placeholder はさらに薄い)。
// パレットに 4.5 を超えつつ薄く見える段が無いので、隣り合う 2 段の中間色にする
// (白地で 5.2 / #242424 地で 6.0 / メニューの #2e2e2e 地で 5.3。e2e/a11y.spec.ts の axe で確認)。
// 赤の文字 (c="red"、メニューのログアウト、アカウント削除の確認の outline ボタンなど) も、ライトの既定 (red 6) は白地で 3.3 しかないので 9 番 (5.5) にする
// (ダークの既定 red 4 は 5.9 で足りている)
const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    "--mantine-color-dimmed":
      "color-mix(in srgb, var(--mantine-color-gray-6), var(--mantine-color-gray-7))",
    "--mantine-color-placeholder": "var(--mantine-color-dimmed)",
    "--mantine-color-red-text": "var(--mantine-color-red-9)",
    "--mantine-color-red-outline": "var(--mantine-color-red-9)",
  },
  dark: {
    "--mantine-color-dimmed":
      "color-mix(in srgb, var(--mantine-color-dark-1), var(--mantine-color-dark-2))",
    "--mantine-color-placeholder": "var(--mantine-color-dimmed)",
  },
});

const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  createRoot(rootElement).render(
    <StrictMode>
      <MantineProvider
        theme={theme}
        defaultColorScheme="auto"
        cssVariablesResolver={cssVariablesResolver}
      >
        <RouterProvider router={router} />
      </MantineProvider>
    </StrictMode>,
  );
}
