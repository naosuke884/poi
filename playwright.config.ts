import { defineConfig, devices } from "@playwright/test";

// アクセシビリティ検査 (npm run test:a11y)。実際に描画したページを axe-core で調べ、違反があれば落とす。
// 単体テスト (vitest) とは別に、Vite + Worker の dev サーバーをローカル D1 付きで起動して本物のページを見る。
// 普段の dev サーバー (:5173) とぶつからないよう、専用のポートで起動する
const PORT = 5174;
const baseURL = `http://localhost:${PORT}`;

// dev container ではブラウザを Playwright の sidecar (PW_TEST_CONNECT_WS_ENDPOINT) で動かす。
// sidecar のブラウザからこのコンテナの localhost に届くよう exposeNetwork を付ける。
// sidecar とクライアントの major.minor は揃える必要があるので、@playwright/test と playwright-core は ~1.62 に固定している
// (playwright-core は @axe-core/playwright の peer。明示しないと最新版が別に入り、型が合わなくなる)
const wsEndpoint = process.env.PW_TEST_CONNECT_WS_ENDPOINT;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // テストは同じテストユーザーの板を書き換えるので、並列にしない
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "ja-JP",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    connectOptions: wsEndpoint ? { wsEndpoint, exposeNetwork: "<loopback>" } : undefined,
  },
  projects: [
    { name: "desktop-light", use: { ...devices["Desktop Chrome"], colorScheme: "light" } },
    // コントラストは配色ごとに変わるので、ダークモードも見る
    { name: "desktop-dark", use: { ...devices["Desktop Chrome"], colorScheme: "dark" } },
    { name: "mobile", use: { ...devices["Pixel 7"], colorScheme: "light" } },
  ],
  webServer: {
    command: `npx vp dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
