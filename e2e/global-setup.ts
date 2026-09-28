import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const STORAGE_STATE = "e2e/.auth/state.json";
// 手元の検証で使うユーザーと混ざらないよう、専用のテストユーザーにする
export const TEST_EMAIL = "a11y-check@example.com";

// ローカル D1 にマイグレーションを当て、テストユーザーでログインした状態 (Cookie) を storageState に書き出す。
// Google OAuth を通さずにログインする仕組みは verifying-in-app skill の seed-session.mjs を使う
// (.dev.vars の BETTER_AUTH_SECRET でセッションに署名するので、.dev.vars が必要)
export default function globalSetup() {
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "poi", "--local"], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  execFileSync(
    "node",
    [
      ".claude/skills/verifying-in-app/scripts/seed-session.mjs",
      "--email",
      TEST_EMAIL,
      "--name",
      "A11y Check",
      "--origin",
      "http://localhost",
      "--out",
      STORAGE_STATE,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
}
