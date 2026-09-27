#!/usr/bin/env node
// Signs a fixed local test user into poi without Google OAuth.
//
// Inserts the user (once) and a fresh session row into the LOCAL D1 (.wrangler/state), then signs
// the session token with BETTER_AUTH_SECRET from .dev.vars the same way Better Auth does
// (HMAC-SHA256, base64, "<token>.<sig>", URL-encoded) so the worker's getSession accepts it.
//
//   node .claude/skills/verifying-in-app/scripts/seed-session.mjs [--email a@example.com] [--name "Test"] [--out state.json]
//
// Prints the Cookie header value on stdout. With --out, also writes a Playwright storageState file.
// Never touches remote D1 (always passes --local). Must run from the repository root.
import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    email: { type: "string", default: "local-test@example.com" },
    name: { type: "string", default: "Local Test" },
    out: { type: "string" },
    origin: { type: "string", default: "http://localhost:5173" },
  },
});

const secret = readFileSync(".dev.vars", "utf8")
  .match(/^BETTER_AUTH_SECRET=(.*)$/m)?.[1]
  ?.trim();
if (!secret) {
  console.error("BETTER_AUTH_SECRET not found in .dev.vars (run from the repository root)");
  process.exit(1);
}

const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
// Better Auth ids/tokens are 32 alphanumeric chars; any unique string works
const rand = () => randomBytes(24).toString("base64url").replace(/[-_]/g, "").slice(0, 32);
const userId = `local-${createHash("sha256").update(values.email).digest("hex").slice(0, 26)}`;
const token = rand();
const now = Date.now();
const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // Better Auth's default session lifetime

const sql = [
  `INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at)
   VALUES (${q(userId)}, ${q(values.name)}, ${q(values.email)}, 1, ${now}, ${now});`,
  `INSERT INTO session (id, token, user_id, expires_at, created_at, updated_at, user_agent)
   SELECT ${q(rand())}, ${q(token)}, id, ${expiresAt}, ${now}, ${now}, 'seed-session.mjs'
   FROM user WHERE email = ${q(values.email)};`,
].join("\n");

execFileSync("npx", ["wrangler", "d1", "execute", "poi", "--local", "--command", sql], {
  stdio: ["ignore", "ignore", "inherit"],
});

const sig = createHmac("sha256", secret).update(token).digest("base64");
const value = encodeURIComponent(`${token}.${sig}`);
const name = "better-auth.session_token"; // no __Secure- prefix because local is plain http

if (values.out) {
  const { hostname } = new URL(values.origin);
  const state = {
    cookies: [
      {
        name,
        value,
        domain: hostname,
        path: "/",
        expires: Math.floor(expiresAt / 1000),
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ],
    origins: [],
  };
  writeFileSync(values.out, JSON.stringify(state, null, 2));
  console.error(`wrote storageState to ${values.out}`);
}
console.error(`signed in ${values.email}; session expires ${new Date(expiresAt).toISOString()}`);
console.log(`${name}=${value}`);
