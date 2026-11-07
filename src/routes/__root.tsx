import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { HeaderSlotProvider } from "@/components/HeaderSlot";

import { AppHeader } from "./(root)/-components/header/AppHeader";
import { NotFound } from "./(root)/-components/NotFound";
import { OfflineBanner } from "./(root)/-components/OfflineBanner";
import { PwaUpdateBanner } from "./(root)/-components/PwaUpdateBanner";
import { SkipLink } from "./(root)/-components/SkipLink";
import { useFocusOnNavigate } from "./(root)/-lib/use-focus-on-navigate";

import classes from "./(root)/-components/RootLayout.module.css";

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

function RootLayout() {
  // ページを移ったら新しいページの h1 へフォーカスを移す (読み上げで遷移が分かるように)
  useFocusOnNavigate();
  return (
    // ページがヘッダーに自分用の操作を出せるようにする (HeaderSlot)
    <HeaderSlotProvider>
      <SkipLink />
      <AppHeader />
      <main id="main" tabIndex={-1} className={classes.main}>
        <div className={classes.page}>
          <OfflineBanner />
          <Outlet />
        </div>
      </main>
      <PwaUpdateBanner />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </HeaderSlotProvider>
  );
}
