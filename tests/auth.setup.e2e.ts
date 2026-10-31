import { execFileSync } from "node:child_process";

import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// 手元の検証や test:a11y のテストユーザーと板が混ざらないよう、専用のユーザーにする
const TEST_EMAIL = "e2e-agent@example.com";

// Google OAuth を通さずにログインする。e2e/global-setup.ts と同じく、ローカル D1 にマイグレーションを当て、
// verifying-in-app skill の seed-session.mjs で作ったセッションの Cookie を入れる (.dev.vars の BETTER_AUTH_SECRET が必要)
test.setup(
  "テストユーザーでログインする",
  { sessions: ["user"] },
  async ({ app, browser, screen, session }) => {
    execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "poi", "--local"], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    const cookie = execFileSync(
      "node",
      [
        ".claude/skills/verifying-in-app/scripts/seed-session.mjs",
        "--email",
        TEST_EMAIL,
        "--name",
        "E2E Agent",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
    ).trim();
    const separator = cookie.indexOf("=");
    await browser.setCookies([
      {
        url: new URL("/", app.baseUrl).href,
        name: cookie.slice(0, separator),
        value: cookie.slice(separator + 1),
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await app.open("/board");
    await expect(screen.getByRole("button", "セクションを追加")).toBeVisible();
    await session.save("user");
  },
);
