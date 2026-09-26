import "@mantine/core/styles.css";
import "./fonts.css";
import { createTheme, MantineProvider } from "@mantine/core";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouteErrorFallback } from "./RouteErrorFallback";
// ホーム画面への追加 (beforeinstallprompt) は React のマウントより先に飛んでくることがあるので、
// 受け取り口をここで先に用意しておく (副作用だけの import)
import "@/lib/install-prompt";
import { removeByPrefix } from "@/lib/local-storage";
import { routeTree } from "./routeTree.gen";

// セクションの折り畳み機能は 2026-09 に廃止した (#51)。端末ごとに localStorage へ
// 記録していた頃の残りを消す (しばらく経ったらこの行ごと消してよい)
removeByPrefix("poi:collapsed:v1:");

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
});

const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  createRoot(rootElement).render(
    <StrictMode>
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <RouterProvider router={router} />
      </MantineProvider>
    </StrictMode>,
  );
}
