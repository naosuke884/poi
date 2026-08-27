import { AppShell, Container, Group, Title, Anchor, Button, Stack, Text } from "@mantine/core";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { UserMenu } from "@/components/UserMenu";

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
            <Group gap="lg">
              <Anchor component={Link} to="/" fw={700} c="inherit" underline="never">
                poi
              </Anchor>
              <Button component={Link} to="/dashboard" variant="subtle" size="compact-sm">
                Dashboard
              </Button>
            </Group>
            <UserMenu />
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="md">
          <Outlet />
        </Container>
      </AppShell.Main>
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </AppShell>
  );
}
