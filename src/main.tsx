import "@mantine/core/styles.css";
import "./fonts.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { RouteErrorFallback } from "@/components/RouteErrorFallback";
import { routeTree } from "./routeTree.gen";

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
