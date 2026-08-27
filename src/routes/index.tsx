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
    <main>
      <h1>poi</h1>
      <p>TanStack Router + Hono + Cloudflare Workers</p>
      <p>
        API says: <code>{message}</code>
      </p>
    </main>
  );
}
