---
name: worker-structure
description: How poi's backend (worker/, a Hono app on a Cloudflare Worker) and shared/ are laid out, and how to add to them — the auth/ and board/ contexts, mounting routes in worker/index.ts, requireAuth, zod validation, the { error } response shape, the Hono RPC client in src/lib/api.ts, pure logic split out of routes, the Cron scheduled handler, Env bindings and secrets, and the @worker / @shared import rules. Use when adding or changing an API endpoint under /api, creating, moving, or renaming files in worker/ or shared/, touching auth middleware or sessions, adding a cron job, binding, or secret, or deciding whether code belongs in shared/ — even if "worker" is not mentioned (e.g. "add an endpoint", "the server should reject X", "store a new user setting"). Where frontend files go inside src/ is route-colocation's job; DB table / column / migration changes are covered by d1-schema-changes.
---

# Worker structure

`worker/` is one Hono app deployed as a Cloudflare Worker (`wrangler.jsonc` `main: ./worker/index.ts`).
It is split into **contexts**, one directory per domain, each owning its routes, schema, and logic.
Only the glue that wires contexts together sits at the root.

This way a context can be read, tested, and deleted as a unit, and the root stays a short table of contents.

```
worker/
  index.ts      app wiring: authMiddleware, /api/auth/*, route mounting, notFound, scheduled, ApiType
  db.ts         createDb / Db / merged schema (every context's schema.ts spread into one)
  types.ts      AppEnv (Bindings: Env, Variables: auth / user / session)
  env.d.ts      secret types merged into the generated Env
  auth/         Better Auth: createAuth, authMiddleware / requireAuth, in-app-browser, clear-site-data, schema.ts (generated)
  board/        the board: routes (board + settings), board-sync (pure diffing), sweep (cron), schema.ts
  site/         page requests that are not static assets (/terms, unknown paths): index.html with 200 / 404, redirects
shared/         code used by both src and worker (constants, limits, pure helpers)
```

## Which context

| It is about | Put it in |
|---|---|
| Sign-in, sessions, users, accounts, Better Auth config / plugins | `auth/` |
| The board, its sections (`memo` rows), revision, per-user settings | `board/` |
| A new domain with its own tables and endpoints | a new `worker/<context>/` with the same file shape (`routes.ts`, `schema.ts`, pure `*.ts` + tests) |
| Wiring every context needs (`AppEnv`, `createDb`, mounting) | worker root |

- Keep the root thin. Anything specific to one domain goes in its context, even when only `index.ts` calls it (e.g. `deleteExpiredMemos` lives in `board/sweep.ts`, not in `index.ts`).
- Dependencies point one way: `board/` may import `auth/` (`requireAuth`, the `user` table for FKs); `auth/` never imports another context. Root files may import any context.
- `auth/schema.ts` is overwritten by `npm run auth:schema` (Better Auth CLI, via `better-auth.config.ts`). Never hand-edit it or add app tables there; that is why app tables live in each context's `schema.ts`.
- A new context's `schema.ts` must also be spread into `schema` in `db.ts` and listed in `drizzle.config.ts`. The rest of the schema work (migrations etc.) is in the `d1-schema-changes` skill.
- Name contexts after the domain, not the layer (history: `memo/` → `app/` → `board/`; `app` said nothing).

## Adding an endpoint

1. Define it in the context's `routes.ts` as a Hono sub-app built with **one method chain**:

   ```ts
   export const fooRoutes = new Hono<AppEnv>()
     .use(requireAuth)
     .get("/", async (c) => { ... })
     .put("/", validate("json", putFooSchema), async (c) => { ... });
   ```

   Chaining (not separate `app.get(...)` statements) is what lets Hono RPC infer the routes' types for the client.
2. Mount it in `worker/index.ts` on the `api` chain: `new Hono<AppEnv>().route("/board", boardRoutes).route("/settings", settingsRoutes)`.
   Mounting on `api` (not `app`) is what puts it into `ApiType`, which the frontend client is typed from.
3. Call it from src via `api` in `src/lib/api.ts` (`hc<ApiType>("/api")`): `api.foo.$get()`, `api.foo.$put({ json })`.
   Derive response types with `InferResponseType<typeof api.foo.$get, 200>` instead of redeclaring them (see `BoardSection` in `src/routes/board/-lib/data/board.ts`).

### Auth

- `authMiddleware` runs on every `/api/*`: it builds a per-request Better Auth instance and sets `auth`, `user`, `session` (null when signed out). For `/api/auth/*` it skips the session lookup, because those requests only go to Better Auth's handler and the DB read would be wasted.
- Responses from Better Auth's handler pass through `withClearSiteData` (`auth/clear-site-data.ts`), which adds `Clear-Site-Data: "cookies"` to a successful `POST /api/auth/sign-out` or `/api/auth/delete-user`. It backs up the Set-Cookie expiry and the client's `clearOfflineCaches`; don't remove either. Note it wipes every cookie on the origin, including the other accounts' `multiSession` cookies. If another endpoint should end the session on this device, add its path there. Never add `"storage"` or `"cache"`: they would delete the Service Worker and its precache, so the PWA could no longer start offline.
- Put `.use(requireAuth)` first in any chain that needs a signed-in user. It returns `401 { error: "Unauthorized" }` and narrows `c.get("user")` to non-null through `AuthedEnv`, so do not add `if (!user)` checks or `!` after it.
- Take the user id from `c.get("user").id`, never from the request body. When the body carries a user id (as PUT /api/board does), it is only a check against the session (`409 UserMismatch`), not the identity.

### Validation and responses

- Validate input with zod through the `validate(target, schema)` wrapper in `board/routes.ts` (wraps `@hono/zod-validator`) and read it with `c.req.valid("json")`.
  It turns failures into `400 { error: "Bad Request", issues }`. Keep it a generic function: a pre-typed hook constant collapses the RPC type to `{}`.
  It currently lives in `board/routes.ts`; when a second context needs it, move it to the worker root rather than importing it across contexts.
- Limits and choices the UI must also know (`BOARD_MAX_LENGTH`, `MEMO_TTL_CHOICES`, ...) come from `@shared/constants`, so client-side checks and server validation cannot drift.
- Return JSON via `c.json(...)`. Errors are always `{ error: "<Code>" }` with a status: `400 Bad Request`, `401 Unauthorized`, `404 Not Found` (unknown `/api/*`, from `app.notFound`), `409` with a machine-readable code (`Stale`, `UserMismatch`) that the client branches on (see `putBoard` in `src/routes/board/-lib/sections/use-board-autosave.ts`). Pick a new PascalCase code for a new conflict rather than reusing one with different meaning.
- Group writes that must succeed together in one `db.batch([...])` (D1 runs a batch as one transaction). Mind D1's limit of 100 bound parameters per statement; `PUT /api/board` binds rows as one JSON array and expands it with `json_each` for that reason.

## Keep logic pure and testable

Routes should read, call pure functions, and write. Put decisions and transformations that don't need the DB (diffing, joining, formatting, validation beyond zod) in their own module in the same context — or in `shared/` if src needs them too — taking plain data and returning a result, and give that module a unit test next to it.
Do this even for a few lines: a route test alone can't pin edge cases cheaply, and inline logic tends to be copied when the frontend needs the same thing.

- Example: `board/board-sync.ts` `planBoardSync(existing, sections, expiredCreatedAt, newId?)` decides updates / inserts / deletes; `routes.ts` only turns the plan into a batch. Inject nondeterminism (`newId`, `now`) as parameters so tests can pin it.
- Tests sit next to the file as `<name>.test.ts` (vitest includes `worker/**/*.test.ts`, node environment).
  - Pure modules: plain unit tests (`board-sync.test.ts`, `auth/in-app-browser.test.ts`).
  - Routes: mount the sub-app in a test Hono app with a middleware that sets a fixed `user` / `session`, and call `app.request(path, init, { DB: db })` with the `db` fixture from `worker/d1-test.ts` — a fresh local D1 (`getPlatformProxy`, `drizzle/` migrations applied) per test (`board/routes.test.ts`). This hits the real SQLite limits, which mocks would hide.
  - Wiring in `index.ts` (what the whole app does to a response, e.g. Clear-Site-Data or security headers): call `worker.fetch(request, env)` from `index.test.ts` with test secrets and a signed session cookie on the same per-test D1, so Better Auth's real handler runs.
  - How to write these tests (fixtures, concurrency, what to assert) is in the `writing-tests` skill.

## Security headers

Two places set them, because Cloudflare serves static assets without running the Worker:

| Responses | Where | What |
|---|---|---|
| `/api/*` (everything in `run_worker_first`) | `app.use("/api/*", secureHeaders(...))` in `worker/index.ts`, before `authMiddleware` so 401s, 404s and Better Auth's handler get it too | Hono defaults (nosniff, `Referrer-Policy: no-referrer`, COOP / CORP same-origin, ...) with `X-Frame-Options: DENY` and a short HSTS. No CSP (JSON only). |
| Everything else (`index.html`, `/assets/*`, `sw.js`, images, video, and the pages `site/pages.ts` serves, which pass on the headers of the `ASSETS.fetch("/")` response) | `public/_headers` (Vite copies it to `dist/client`; Cloudflare's asset server applies it and never serves the file) | `Content-Security-Policy-Report-Only`, `X-Frame-Options: DENY`, nosniff, HSTS, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` |

- Keep HSTS and `X-Frame-Options` identical in both (a test in `worker/index.test.ts` compares them). HSTS starts at `max-age=86400`; raise it in both places once production has run without trouble.
- The CSP is `script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`, Report-Only: violations are only logged in the browser console as `[Report Only]` (there is no report endpoint). No `style-src` (Mantine injects inline styles) and no `default-src` (images from Google avatars, same-origin fetches and media are not restricted). `base-uri` is `'self'`, not `'none'`, because modern-screenshot (「画像にする」) sets a same-origin `<base>` to resolve fonts in CSS. `X-Frame-Options: DENY` blocks framing while the CSP is not enforced.
- To enforce it later, rename the header to `Content-Security-Policy` after checking the console in production. Before changing it, verify against the built app: **`npm run dev` (Vite) does not apply `_headers`**, only `wrangler dev` on the build does:
  ```sh
  npm run build
  npx wrangler dev --config dist/poi/wrangler.json --port 8788 --persist-to .wrangler/state   # the build's config, the dev server's local D1
  curl -sI http://localhost:8788/ | grep -i content-security
  ```
  Then drive the pages with the Playwright sidecar (`verifying-in-app`, seed the session with `--origin http://localhost:8788`) and look for `securitypolicyviolation` events / `[Report Only]` console messages (Chromium logs them at `info` level, not `error`). Stop it afterwards; `--config dist/poi/...` without `--persist-to` uses an empty D1 in `dist/poi/.wrangler`.
- A new header for `/api/*` goes in the `secureHeaders` options; for pages, in `_headers`. Don't set page headers from the Worker: `/` and other assets never reach it.

## Pages (`site/`)

`wrangler.jsonc` has `not_found_handling: "none"`, so a path with no static asset (`/terms`, `/privacy`, `/nope`, `/login`) reaches the Worker, and `app.notFound` hands non-`/api` paths to `servePage` (`site/pages.ts`).
It returns index.html with 200 for `PAGE_PATHS` (`shared/site.ts`), `/sitemap.xml` built from `PAGE_PATHS` (`site/sitemap.ts`), 301 for `PAGE_REDIRECTS` and trailing slashes, a bare 404 for paths with an extension, and index.html with 404 for anything else (no soft 404s). `/` itself is a static asset and never reaches the Worker.
When adding a route under `src/routes`, add its path to `PAGE_PATHS` (the sitemap follows), or to `PAGE_REDIRECTS` if it only redirects; `site/pages.test.ts` fails otherwise.

## Scheduled work (Cron)

- Crons are declared in `wrangler.jsonc` `triggers.crons` (currently `"0 * * * *"`) and all go to the one `scheduled` handler in `worker/index.ts`.
- Keep the handler a thin adapter: build the db with `createDb(env.DB)`, pass `new Date(controller.scheduledTime)`, call a context function (`deleteExpiredMemos` in `board/sweep.ts`), and `console.log` the result (Workers Logs via `observability`). The function takes `db` and `now` so tests and other callers can reuse it.
- A job with its own schedule (e.g. "once a day") gets its own expression in `triggers.crons`; don't fold it into the hourly sweep — that silently changes the frequency the user asked for and mixes two jobs' logs. Branch on `controller.cron` in the handler (constants for each expression, `console.warn` on an unknown one), and put the job's function in the context that owns the table (sessions → `auth/`) with a D1-backed test next to it, like `board/sweep.ts`.
- Run it locally with the steps in the comment above `scheduled` (`npm run dev` (Vite) cannot trigger crons):
  ```sh
  npm run build
  npx wrangler dev --config wrangler.jsonc --assets dist/client --test-scheduled --port 8788
  curl "http://localhost:8788/__scheduled?cron=0+*+*+*+*"   # prints "Ran scheduled event"; the handler's log line appears in wrangler's output
  ```
  Use a port other than 5173 (the dev server) and stop it afterwards. wrangler's bundler resolves `@shared/*` through the root `tsconfig.json` `paths`. `/__scheduled` is in `assets.run_worker_first` for this.

## Env, bindings, secrets

- `Env` is generated into `worker-configuration.d.ts` by `wrangler types` (git-ignored; `npm run typecheck` and `npm run cf-typegen` regenerate it). After adding a binding to `wrangler.jsonc`, rerun it instead of typing the binding by hand.
- Secrets are not in `wrangler.jsonc`: declare their types in `worker/env.d.ts` (merged into `Env`), add the name to `.dev.vars.example`, set them locally in `.dev.vars` and in production with `npx wrangler secret put <NAME>`. Also add a dummy value to the `Env` literal in `better-auth.config.ts` (a required secret missing there fails `npm run typecheck`).
- Access bindings only through `c.env` (routes) or the handler's `env` (scheduled); there is no global env.

## Imports

| From | May import | How |
|---|---|---|
| worker | worker files | relative paths (`../db`, `./schema`); `@worker` is not mapped in `tsconfig.worker.json` |
| worker | shared | `@shared/...` |
| src | worker | **types only**: `import type { ApiType } from "@worker/index"` in `src/lib/api.ts` |
| src | shared | `@shared/...` |
| shared | src / worker | never (Biome `noRestrictedImports` override on `shared/**`) |

- Values from worker must not reach src: a value import would bundle Worker code (Drizzle, Better Auth) into the browser. Nothing lints this; `import type` is the guard, so keep it.
  If src needs a worker value (a constant, a limit, a pure function), move it to `shared/` instead.
- `shared/` is its own TS project (`tsconfig.shared.json`, `lib: ES2023`, no DOM or Workers types), so code there must run in both runtimes. Keep it free of `c.env`, D1, `window`, etc.; typecheck fails if you use them.
- Nothing prevents worker from importing src; don't.

## After changing worker/ or shared/

1. If you renamed or moved a file, `grep -rn "<old path or name>" src worker shared *.ts wrangler.jsonc` — comments across the repo cite worker paths (e.g. `worker/board/routes.ts` in `shared/constants.ts`), and `drizzle.config.ts` lists schema files.
2. Make `npm run typecheck && npm run lint && npm test && npm run build` pass. `typecheck` also checks src against the new `ApiType`, so a changed response shape surfaces there.
