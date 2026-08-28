import { Button, Paper, Stack, Text, Title } from "@mantine/core";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await authClient.getSession();
    if (data) throw redirect({ to: search.redirect ?? "/" });
  },
  component: Login,
});

function Login() {
  const { redirect: redirectTo } = Route.useSearch();
  return (
    <Paper withBorder p="xl" maw={400} mx="auto" mt="xl">
      <Stack>
        <Title order={2}>ログイン</Title>
        <Text c="dimmed" size="sm">
          Google アカウントでログインします。
        </Text>
        <Button
          onClick={() =>
            authClient.signIn.social({
              provider: "google",
              callbackURL: redirectTo ?? "/",
            })
          }
        >
          Google でログイン
        </Button>
      </Stack>
    </Paper>
  );
}
