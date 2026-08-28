import { AppShell, Container, Group, Title, Anchor, Stack, Text } from "@mantine/core";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
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
            <UserMenu />
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="md">
          <OfflineBanner />
          <Outlet />
        </Container>
      </AppShell.Main>
      <PwaUpdateBanner />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </AppShell>
  );
}
