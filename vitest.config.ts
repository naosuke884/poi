import { defineConfig } from "vitest/config";

// 単体テスト (npm test)。アプリのビルド設定 (vite.config.ts) の cloudflare / PWA プラグインは要らないので、
// パスの解決だけ揃えた別設定にする。既定の環境は node で、DOM が要るテストはファイル先頭の
// `// @vitest-environment jsdom` で切り替える
export default defineConfig({
  resolve: {
    // tsconfig.app.json の "paths" ("@/*" -> "./src/*") を解決する
    tsconfigPaths: true,
  },
  test: {
    include: ["src/**/*.test.ts", "worker/**/*.test.ts"],
  },
});
