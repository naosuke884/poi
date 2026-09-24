import "@mantine/core/styles.css";
import "./fonts.css";
import { createTheme, MantineProvider } from "@mantine/core";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouteErrorFallback } from "./RouteErrorFallback";
// ホーム画面への追加 (beforeinstallprompt) は React のマウントより先に飛んでくることがあるので、
// 受け取り口をここで先に用意しておく (副作用だけの import)
import "./install-prompt";
import { removeByPrefix } from "./local-storage";
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

// 欧文は Inter、日本語などそれ以外の文字は各環境のシステムフォントに任せる (fonts.css)
const theme = createTheme({
  fontFamily: '"Inter Variable", system-ui, sans-serif',
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
