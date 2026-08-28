import { Stack, Text, Title } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <Stack>
      <Title>poi</Title>
      <Text>TanStack Router + Hono + Better Auth (Google) + D1 + Mantine on Cloudflare Workers</Text>
    </Stack>
  );
}
