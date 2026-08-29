import { AppShell, Container, Group, Title, Anchor, Stack, Text } from "@mantine/core";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { SaveStatusIcon } from "@/components/SaveStatusIcon";
import { UserMenu } from "@/components/UserMenu";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PwaUpdateBanner } from "@/components/PwaUpdateBanner";

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

function RootLayout() {
  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Container size="md" h="100%">
          <Group h="100%" justify="space-between">
            <Anchor component={Link} to="/" fw={700} c="inherit" underline="never">
              poi
            </Anchor>
            <Group gap="xs">
              <SaveStatusIcon />
              <UserMenu />
            </Group>
          </Group>
        </Container>
      </AppShell.Header>
      {/* Main → Container → ページ を縦の flex にして、板が画面の下端まで広がれるようにする */}
      <AppShell.Main style={{ display: "flex", flexDirection: "column" }}>
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
