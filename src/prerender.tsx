import { createMemoryHistory } from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { App, createAppRouter } from "./app";

/**
 * ビルド時に Node で呼び、トップ (/) のランディングを HTML にする (vite.config.ts の prerenderLanding。issue #157)。
 * 未ログインで初めて開いた人と同じ描画 (ヘッダーのユーザーメニューはセッション確認中の表示) になる。
 * ブラウザでは main.tsx が同じものを描いて置き換える
 */
export async function renderLanding(): Promise<string> {
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/"] }), { ssr: true });
  await router.load();
  return renderToString(<App router={router} />);
}
