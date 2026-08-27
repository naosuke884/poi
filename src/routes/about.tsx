import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: About,
});

function About() {
  return (
    <main>
      <h1>About</h1>
      <p>このページを直接リロードしても SPA フォールバックで表示されます。</p>
    </main>
  );
}
