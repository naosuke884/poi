import { describe, expect } from "vite-plus/test";

import { createAuth } from ".";
import { test } from "../d1-test";

const USER_ID = "u1";

const it = test.extend("auth", async ({ db }) => {
  const now = Date.now();
  await db
    .prepare(
      "insert into user (id, name, email, email_verified, created_at, updated_at) values (?, 'Test', 'test@example.com', 1, ?, ?)",
    )
    .bind(USER_ID, now, now)
    .run();
  const env = {
    DB: db,
    BETTER_AUTH_SECRET: "test-secret-0123456789abcdef0123456789",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
  } as unknown as Env;
  return createAuth(env, "http://localhost");
});

/** account 行のトークンの列 */
async function tokensOf(db: D1Database) {
  return db
    .prepare("select access_token, refresh_token, id_token from account where user_id = ?")
    .bind(USER_ID)
    .first();
}

const GOOGLE_TOKENS = { accessToken: "ya29.access", refreshToken: "1//refresh", idToken: "eyJ.id" };

describe.concurrent("Google のトークン", () => {
  it("ログインで account 行を作るときは保存しない", async ({ db, auth }) => {
    const { internalAdapter } = await auth.$context;
    await internalAdapter.createAccount({
      userId: USER_ID,
      providerId: "google",
      accountId: "g-1",
      ...GOOGLE_TOKENS,
    });
    expect(await tokensOf(db)).toEqual({ access_token: null, refresh_token: null, id_token: null });
  });

  it("ログインし直して account 行を更新するときも保存しない", async ({ db, auth }) => {
    const { internalAdapter } = await auth.$context;
    const created = await internalAdapter.createAccount({
      userId: USER_ID,
      providerId: "google",
      accountId: "g-1",
    });
    await internalAdapter.updateAccount(created.id, GOOGLE_TOKENS);
    expect(await tokensOf(db)).toEqual({ access_token: null, refresh_token: null, id_token: null });
  });
});
