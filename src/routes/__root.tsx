import { AppShell, Container } from "@mantine/core";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { AppHeader } from "./-root/header/AppHeader";
import { NotFound } from "./-root/NotFound";
import { OfflineBanner } from "./-root/OfflineBanner";
import { PwaUpdateBanner } from "./-root/PwaUpdateBanner";
import { SkipLink } from "./-root/SkipLink";

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

// ノッチ / ホームインジケータのある端末 (viewport-fit=cover) で内容が隠れないよう、
// AppShell の余白に env(safe-area-inset-*) を足す (Mantine の padding 変数はそのまま使う)
const mainPadding = {
  paddingInlineStart: "calc(var(--app-shell-padding) + env(safe-area-inset-left))",
  paddingInlineEnd: "calc(var(--app-shell-padding) + env(safe-area-inset-right))",
  paddingBottom: "calc(var(--app-shell-padding) + env(safe-area-inset-bottom))",
};

function RootLayout() {
  return (
    <AppShell header={{ height: 56 }} padding="md">
      <SkipLink />
      <AppHeader />
      {/* Main → Container → ページ を縦の flex にして、板が画面の下端まで広がれるようにする */}
      <AppShell.Main
        id="main"
        tabIndex={-1}
        style={{ display: "flex", flexDirection: "column", ...mainPadding }}
      >
        <Container size="md" w="100%" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <OfflineBanner />
          <Outlet />
        </Container>
      </AppShell.Main>
      <PwaUpdateBanner />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </AppShell>
  );
}
