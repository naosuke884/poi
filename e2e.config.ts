import { claudeCode } from "@e2e-dev/acp";
import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";

// e2e (tester-army/e2e) のテスト (npm run test:e2e)。agent.act / agent.assert で自然文の目標を AI に操作させ、
// 結果は locator の expect で確かめる。e2e/ の Playwright (npm run test:a11y) とは別の仕組みで、テストは tests/ に置く。
// 普段の dev サーバー (:5173) や test:a11y の dev サーバー (:5174) とぶつからないよう、専用のポートで起動する
const PORT = 5175;

export default {
  targets: [
    {
      engine: web({ locale: "ja-JP", timezoneId: "Asia/Tokyo" }),
      app: {
        // seed-session.mjs の Cookie は localhost 向けに作るので、127.0.0.1 ではなく localhost にする
        url: `http://localhost:${PORT}`,
        command: {
          executable: "npx",
          args: ["vp", "dev", "--port", String(PORT), "--strictPort"],
          startupTimeout: 120_000,
          reuseExisting: true,
          log: ".e2e/logs/app.log",
        },
      },
    },
  ],
  // テストは同じテストユーザーの板を書き換えるので、並列にしない
  workers: 1,
  // AI のステップは、手元の Claude Code のログインで動かす (API キーを持たずに済む)。
  // CI には Claude Code のログインが無いので、CI では AI を使うテスト (tag: agent) を外して回す
  agents: { default: { executor: claudeCode({ model: "sonnet" }) } },
} satisfies E2EConfig;
