---
name: verifying-in-app
description: Launches poi locally (the Vite + Cloudflare Worker dev server on :5173 with local D1) and confirms a change actually works in the running app — signs in a local test user without Google OAuth, drives the board headlessly with the Playwright sidecar, takes screenshots to look at, hits the worker API with curl, and opens the page in the user's host browser. Use after implementing or fixing anything user-visible or any /api behavior, before reporting it done; when asked to run, start, restart, or screenshot the app; for "動作確認して", "スクショ撮って", "画面で確認して", "ブラウザで再現して"; when reproducing a bug in the browser; or when the dev server seems down or stale — even if "run" or "browser" is not mentioned. Tests passing is not the same as the app working; use this to check the real thing. Not for re-recording the README / landing demo video.
---

# Verifying a change in the running app

Unit tests mock the router, the auth client and the API. They do not show whether the page renders, whether the editor saves, or whether a worker change is wired up.
Before saying a change works, see it in the running app: the board page as a signed-in user, or the API it calls.

Paths below are relative to the repository root. `<skill>` is `.claude/skills/verifying-in-app`.

## 1. Make sure the dev server is up

```sh
scripts/dev-server.sh status   # "responding on :5173 (supervisor pid N)" when it is up
scripts/dev-server.sh start    # no-op if it already responds; waits up to 60s
scripts/dev-server.sh restart
tail -n 50 /tmp/poi-dev-server.log   # recent output (`dev-server.sh logs` follows forever; don't run it in the foreground)
```

The dev container usually starts it on boot, so check `status` first and leave it running when you finish. Only `restart` when `status` shows it is not responding; other sessions use the same server, and a restart drops their connections.
It runs `npm run dev` (= `vite`) in a supervised loop that restarts it if it exits. Vite serves the SPA and, through `@cloudflare/vite-plugin`, runs `worker/` in a local workerd with the bindings from `wrangler.jsonc` and secrets from `.dev.vars`.
The port is fixed (`strictPort`), so a second `npm run dev` fails instead of moving to 5174. Always go through the script.

What picks up changes by itself (checked in the log):

| Change | What happens | Action |
|---|---|---|
| `src/**` | Vite HMR | none; reload the page |
| `worker/**`, `shared/**` | `hmr update /@id/virtual:cloudflare/worker-entry` (worker reloaded) | none |
| `.dev.vars`, `wrangler.jsonc`, `vite.config.ts` | `server restarted.` | none; wait a few seconds |
| New migration under `drizzle/` | nothing | `npm run db:migrate:local` (no restart needed) |
| `status` says the supervisor runs but :5173 does not respond (workerd crashed or hung) | | `scripts/dev-server.sh restart` |

## 2. Local D1

Local data lives in `.wrangler/state/v3/d1/` (gitignored), shared by the dev server and `wrangler d1 ... --local`, so writes from either side show up in the other immediately.

```sh
npx wrangler d1 migrations list poi --local   # "No migrations to apply!" when up to date
npm run db:migrate:local                       # apply pending ones (after pulling or adding a migration)
npx wrangler d1 execute poi --local --command "select id, email from user"
```

Always pass `--local`. Without it wrangler targets the production D1. Never run `db:migrate:remote`, `--remote`, or `deploy`.
Do not delete `.wrangler/state`: it also holds the user's own local accounts and notes.
Schema changes themselves are the `d1-schema-changes` skill's job.

## 3. Sign in without Google

Login is Google OAuth only, which cannot be completed headlessly. Better Auth only needs a `session` row plus a cookie `better-auth.session_token=<token>.<HMAC-SHA256(token, BETTER_AUTH_SECRET) in base64>` (URL-encoded) to resolve a session, so the script inserts the rows into local D1 and signs the cookie with the secret from `.dev.vars`:

```sh
node <skill>/scripts/seed-session.mjs --out "$TMP/state.json"
# stdout: better-auth.session_token=...   (Cookie header value, for curl)
# --out:  Playwright storageState with that cookie for localhost
```

- By default it uses the user `local-test@example.com` ("Local Test") and creates a fresh 7-day session on each run. **Pass your own `--email` (e.g. `--email check-<topic>@example.com`)** unless you are sure nothing else uses the default user: other sessions and agents verify against the same local D1, and a shared user's board changes under you. `--email` / `--name` also give a second user for account switching or cross-user checks.
- The test user has no Google `account` row. Flows that talk to Google (adding an account, re-login) cannot be exercised this way; leave those to the user.
- Use the test user, not the user's real local account: its notes are the user's.
- The secret is read and used locally only. Never print it or copy it anywhere.

Use `$TMP` = the scratchpad directory (or any temp dir) for the state file and screenshots, not the repo.

## 4. Drive the UI headlessly

There is no local Chromium. The dev container has a Playwright server sidecar (`PW_TEST_CONNECT_WS_ENDPOINT=ws://playwright:3000/`), and `<skill>/scripts/pw.mjs` connects to it with `exposeNetwork: "<loopback>"`, so the remote browser reaches `http://localhost:5173` in this container and the `localhost` cookie applies.
The client must match the server's Playwright version; `pw.mjs` installs `playwright-core` into `~/.cache/poi-playwright/<version>` on first use (outside the repo) and switches versions by itself when the server reports a mismatch. Do not add Playwright to `package.json` for this.

Quick screenshot:

```sh
node <skill>/scripts/pw.mjs http://localhost:5173/board "$TMP/board.png" --state "$TMP/state.json"
node <skill>/scripts/pw.mjs http://localhost:5173/ "$TMP/landing-mobile.png" --width 390 --height 844 --full   # signed out, phone width
```

Then look at it with the Read tool. Check the changed area, not just that something rendered.
Page errors and `console.error`s are printed to stderr; treat them as failures too.

Interaction: write a small script in `$TMP` and run it with `node`. `openPage` returns a Playwright `page` (locale `ja-JP`, 1280x800 unless you pass `viewport`):

```js
import { openPage } from "/home/dev-container/poi/.claude/skills/verifying-in-app/scripts/pw.mjs";

const TMP = "<scratchpad dir>";

const { browser, page } = await openPage({ storageState: `${TMP}/state.json` });
try {
  await page.goto("http://localhost:5173/board");
  await page.getByRole("button", { name: "セクションを追加" }).click();
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/board") && r.request().method() === "PUT");
  await page.keyboard.insertText("second section");
  console.log("PUT", (await saved).status()); // wait for the save instead of sleeping
  await page.screenshot({ path: `${TMP}/after.png` });
} finally {
  await browser.close();
}
```

- The editor is CodeMirror (`.cm-content`). `keyboard.type` goes through its keymaps and auto-formatting (typing `"# title\n- item"` saved `"# title\n- - item"`). Use `keyboard.insertText` to put text in verbatim, and `type` / `press` only when testing the key handling itself.
- Prefer role / text locators (`getByRole`, `getByText`) over CSS classes; CSS Module class names are hashed.
- Each run starts a fresh browser context, so there is no stale state from the previous run except what is in D1. Reset the board through the API (below) when a check needs a known starting point.

## 5. Check the API directly

For worker changes, curl is faster and shows the exact status and body:

```sh
C=$(node <skill>/scripts/seed-session.mjs 2>/dev/null)
curl -s -H "Cookie: $C" http://localhost:5173/api/auth/get-session
curl -s -H "Cookie: $C" http://localhost:5173/api/board        # {"userId","sections","revision","ttlDays"}
curl -s -i http://localhost:5173/api/board | head -1           # HTTP/1.1 401 Unauthorized without a cookie
curl -s -X PUT -H "Cookie: $C" -H 'Content-Type: application/json' \
  -d '{"userId":"<userId>","revision":"<revision or null>","sections":[{"id":null,"content":"hello"}]}' \
  http://localhost:5173/api/board
```

PUT replaces the whole board and returns 409 when `revision` is not the current one, so take `userId` and `revision` from a GET first.

## 5b. Production build (chunks, Service Worker, offline)

The dev server serves unbundled modules and registers no Service Worker, so questions like "which chunks does this page download?" or "does it start offline from the precache?" need the production build.
`npx vite preview --port 4173 --strictPort` (after `npm run build`; run it in the background) serves `dist/` through the same local workerd and local D1, and the `seed-session.mjs` cookie works there too (cookies are not per port).
- List what a page fetched: `performance.getEntriesByType("resource")` in `page.evaluate` (name, `startTime`, `responseEnd`) shows both which chunks loaded and whether requests ran in parallel.
- Offline: load the page once, `await navigator.serviceWorker.ready`, then `page.context().setOffline(true)` and `page.reload()`. `caches.keys()` / `caches.open(n).keys()` list the precached files.
- Throttle with CDP (`page.context().newCDPSession(page)`, `Network.emulateNetworkConditions`) to compare load times; preview serves uncompressed, so absolute numbers are pessimistic.
- Stop the preview when done (kill its `vite preview` process by PID; don't `pkill -f "vite preview"` from a shell whose own command line contains that text). It does not replace the dev server on :5173.

## 6. Show it to the user

Port 5173 is forwarded to the host (Vite listens on `0.0.0.0`), so open it directly:

```sh
host-open http://localhost:5173/
```

The host browser has its own cookies: the user sees their own account (they can sign in with Google locally), not the seeded test user.
For anything else (an HTML report, a server on another port), use the `open-in-browser` skill.

## Clean up

- Leave the dev server running (restart it if you stopped it).
- Test users can stay; to remove one with its sessions and notes: `npx wrangler d1 execute poi --local --command "delete from user where email = 'local-test@example.com'"` (sessions and memos cascade).
