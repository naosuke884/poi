import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => (
    <main>
      <h1>404</h1>
      <p>ページが見つかりません。</p>
      <Link to="/">トップへ戻る</Link>
    </main>
  ),
});

function RootLayout() {
  return (
    <>
      <nav>
        <Link to="/" activeProps={{ className: "active" }} activeOptions={{ exact: true }}>
          Home
        </Link>
        <Link to="/about" activeProps={{ className: "active" }}>
          About
        </Link>
      </nav>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  );
}
