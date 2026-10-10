import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * テスト用の本物のルーター (メモリ上の履歴)。ページのルートは持たず、どのパスへも移れる。
 * 移った先は router.state.location で、データの取り直し (invalidate など) は loader の呼ばれた回数で確かめる
 */
export function createTestRouter({
  initialPath = "/",
  loader,
}: {
  initialPath?: string;
  loader?: () => void;
} = {}) {
  return createRouter({
    routeTree: createRootRoute({ loader }),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
}

/**
 * children を router の中に置く。RouterProvider だとルートに合ったページしか描かないので、
 * 調べる部品をそのまま描けるようにルーターの文脈だけを渡す
 */
export function WithRouter({
  router,
  children,
}: {
  router: ReturnType<typeof createTestRouter>;
  children: ReactNode;
}) {
  return <RouterContextProvider router={router}>{children}</RouterContextProvider>;
}
