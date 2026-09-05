import { AppShell, Container, Group, Title, Anchor, Stack, Text } from "@mantine/core";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { AddSectionButton } from "@/components/AddSectionButton";
import { SaveStatusIcon } from "@/components/SaveStatusIcon";
import { UserMenu } from "@/components/UserMenu";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PwaUpdateBanner } from "@/components/PwaUpdateBanner";
import classes from "./__root.module.css";

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => (
    <Stack>
      <Title>404</Title>
      <Text>ページが見つかりません。</Text>
      <Anchor component={Link} to="/">
        トップへ戻る
      </Anchor>
    </Stack>
  ),
});

// ノッチ / ホームインジケータのある端末 (viewport-fit=cover) で内容が隠れないよう、
// AppShell の余白に env(safe-area-inset-*) を足す (Mantine の padding 変数はそのまま使う)
const safeAreaX = {
  paddingLeft: "env(safe-area-inset-left)",
  paddingRight: "env(safe-area-inset-right)",
};
const mainPadding = {
  paddingInlineStart: "calc(var(--app-shell-padding) + env(safe-area-inset-left))",
  paddingInlineEnd: "calc(var(--app-shell-padding) + env(safe-area-inset-right))",
  paddingBottom: "calc(var(--app-shell-padding) + env(safe-area-inset-bottom))",
};

function RootLayout() {
  return (
    <AppShell header={{ height: 56 }} padding="md">
      {/* キーボード操作用: ヘッダーを飛ばして本文へ */}
      <a href="#main" className={classes.skipLink}>
        本文へ移動
      </a>
      <AppShell.Header style={safeAreaX}>
        <Container size="md" h="100%">
          <Group h="100%" justify="space-between">
            <Anchor component={Link} to="/" fw={700} c="inherit" underline="never">
              <Group gap={8} wrap="nowrap">
                <img src="/icon.svg" alt="" width={24} height={24} style={{ display: "block" }} />
                poi
              </Group>
            </Anchor>
            <Group gap="md">
              <AddSectionButton />
              <SaveStatusIcon />
              <UserMenu />
            </Group>
          </Group>
        </Container>
      </AppShell.Header>
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
