import { Code, Stack, Text, Title } from "@mantine/core";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

// ログイン必須ページ: 未ログインなら /login へ (戻り先を search に保持)
export const Route = createFileRoute("/dashboard")({
  beforeLoad: async ({ location }) => {
    const { data } = await authClient.getSession();
    if (!data) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { session: data };
  },
  loader: async () => {
    const res = await api.me.$get();
    if (!res.ok) throw new Error("Failed to load /api/me");
    return res.json();
  },
  component: Dashboard,
});

function Dashboard() {
  const { session } = Route.useRouteContext();
  const { user } = Route.useLoaderData();
  return (
    <Stack>
      <Title order={2}>Dashboard</Title>
      <Text>こんにちは、{session.user.name} さん</Text>
      <Text size="sm" c="dimmed">
        /api/me (Hono, 要ログイン) のレスポンス:
      </Text>
      <Code block>{JSON.stringify(user, null, 2)}</Code>
    </Stack>
  );
}
