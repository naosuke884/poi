import { Code, Stack, Text, Title } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@/lib/api";

export const Route = createFileRoute("/")({
  loader: async () => {
    const res = await api.hello.$get();
    return res.json();
  },
  component: Home,
});

function Home() {
  const { message } = Route.useLoaderData();
  return (
    <Stack>
      <Title>poi</Title>
      <Text>TanStack Router + Hono + Better Auth (Google) + D1 + Mantine on Cloudflare Workers</Text>
      <Text>
        API says: <Code>{message}</Code>
      </Text>
    </Stack>
  );
}
