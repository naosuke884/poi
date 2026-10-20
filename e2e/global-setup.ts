import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const STORAGE_STATE = "e2e/.auth/state.json";
// 手元の検証で使うユーザーと混ざらないよう、専用のテストユーザーにする
export const TEST_EMAIL = "a11y-check@example.com";
// 板に書いて保存されるかを見るテスト (production.spec.ts) 用。a11y.spec.ts は板をまるごと置き換えるので、ユーザーを分ける
export const PERSISTENCE_STORAGE_STATE = "e2e/.auth/persistence.json";
const PERSISTENCE_EMAIL = "e2e-persistence@example.com";

// ローカル D1 にマイグレーションを当て、テストユーザーでログインした状態 (Cookie) を storageState に書き出す。
// Google OAuth を通さずにログインする仕組みは verifying-in-app skill の seed-session.mjs を使う
// (.dev.vars の BETTER_AUTH_SECRET でセッションに署名するので、.dev.vars が必要)
export default function globalSetup() {
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "poi", "--local"], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  seedSession(TEST_EMAIL, "A11y Check", STORAGE_STATE);
  seedSession(PERSISTENCE_EMAIL, "E2E Persistence", PERSISTENCE_STORAGE_STATE);
}

function seedSession(email: string, name: string, out: string) {
  execFileSync(
    "node",
    [
      ".claude/skills/verifying-in-app/scripts/seed-session.mjs",
      "--email",
      email,
      "--name",
      name,
      "--origin",
      "http://localhost",
      "--out",
      out,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
}
