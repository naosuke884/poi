# poi

> A memo pad that forgets. Everything you write disappears 30 days after you wrote it.

[日本語版 README](./README.ja.md)

**poi** (ぽい, Japanese for "toss it away") is a single-page scratchpad for the things you only need for a
little while: today's errands, a phone number, a half-formed thought. You sign in with Google, you get one
board, and whatever you type is saved as you go and quietly deleted a month later. Nothing to organize,
nothing to clean up.

It runs entirely on a single Cloudflare Worker with a D1 database, so you can self-host it for free.

> **Note:** The user interface is currently Japanese only.

## Features

- **One board, synced everywhere** — sign in with the same Google account on your laptop and phone and see the same board.
- **Sections that expire on their own** — two blank lines (press Enter three times) start a new section.
  Each section expires 30 days after it was first written, independently of the others; an hourly cron job
  physically deletes expired ones.
- **Autosave** — there is no save button. Changes are saved one second after you stop typing.
  A cloud icon in the header shows the save state.
- **Lightweight Markdown** — sections you are not editing are rendered as Markdown. Only headings,
  bullet / numbered lists and auto-linked URLs are enabled; everything else (emphasis, code, quotes, tables,
  HTML, …) is shown literally so a stray `*` or `>` never mangles a note.
- **Installable PWA** — add it to your home screen. When offline it shows the last fetched board read-only,
  and edits made while the connection drops are kept and re-sent when you're back online.
- **Small footprint** — one Worker, one D1 database, no third-party services beyond Google sign-in.
  Fits comfortably in Cloudflare's free tier for personal use.

## Tech stack

| Layer     | Choice                                                                     |
| --------- | -------------------------------------------------------------------------- |
| Runtime   | [Cloudflare Workers](https://workers.cloudflare.com/) + [D1](https://developers.cloudflare.com/d1/) (SQLite) + Cron Triggers |
| API       | [Hono](https://hono.dev/) with typed RPC client, [Zod](https://zod.dev/) validation |
| Auth      | [Better Auth](https://www.better-auth.com/) (Google OAuth)                  |
| DB        | [Drizzle ORM](https://orm.drizzle.team/) + drizzle-kit migrations           |
| Frontend  | React 19, [TanStack Router](https://tanstack.com/router), [Mantine](https://mantine.dev/), [react-markdown](https://github.com/remarkjs/react-markdown) |
| Build     | [Vite](https://vite.dev/) + `@cloudflare/vite-plugin` + `vite-plugin-pwa`  |

## Self-hosting

### Prerequisites

- Node.js 24 (see `.node-version`)
- A [Cloudflare](https://dash.cloudflare.com/) account (free tier is enough)
- A Google OAuth 2.0 client: in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
  create **OAuth client ID → Web application** and note the client ID / secret.
  You will add redirect URIs to it below.

### Run locally

```sh
git clone https://github.com/naosuke884/poi.git
cd poi
npm install
cp .dev.vars.example .dev.vars   # fill in BETTER_AUTH_SECRET / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
npm run db:migrate:local         # apply migrations to the local D1
npm run dev                      # http://localhost:5173
```

Add `http://localhost:5173/api/auth/callback/google` to the OAuth client's **Authorized redirect URIs**.

The dev server runs the Worker and a local D1 inside workerd, so the full stack (auth, API, cron handler)
works locally. The service worker is not registered in dev; build and preview to test PWA behaviour.

### Deploy to Cloudflare

First-time setup (steps 1–6), then deploy (step 7). Later deploys only need step 7.

1. Log in:
   ```sh
   npx wrangler login
   ```
2. Create the database and paste the printed `database_id` into `wrangler.jsonc` (`d1_databases[0].database_id`).
   The value checked into this repository belongs to the maintainer's account and will not work for you.
   ```sh
   npx wrangler d1 create poi
   ```
3. Apply migrations to the production database:
   ```sh
   npm run db:migrate:remote
   ```
4. Set secrets (same names as in `.dev.vars`; never commit the values):
   ```sh
   openssl rand -base64 32 | npx wrangler secret put BETTER_AUTH_SECRET
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
5. Add the production redirect URI `https://<your-domain>/api/auth/callback/google` to the Google OAuth client.
   `<your-domain>` is `poi.<account>.workers.dev` unless you set a custom domain.
6. *(Optional)* Custom domain: uncomment `routes` in `wrangler.jsonc` and set your domain
   (the zone must be in the same Cloudflare account).
7. Build and deploy:
   ```sh
   npm run deploy
   ```

After deploying, open `https://<your-domain>/` — you should be redirected to `/login` and be able to sign in
with Google. `GET /api/board` without a session returns `401`. The Workers dashboard logs should show
`[memo sweep] deleted N ...` once an hour.

<details>
<summary>Notes</summary>

- `BETTER_AUTH_URL` is optional. When unset, the request origin is used, so both `workers.dev` and a custom
  domain work at once. Set it (`wrangler secret put BETTER_AUTH_URL`) only if you want to pin auth to a single origin.
- `wrangler.jsonc` is read by `wrangler deploy`, so the `database_id` must be real — a placeholder fails with
  `binding DB ... database_id not found`.
</details>

### Deploy from GitHub Actions

`.github/workflows/deploy.yml` deploys on every push to `main` (typecheck → build → D1 migrations → `wrangler deploy`).
It is **off by default** — the job is guarded by a repository variable, so forking the repo does nothing until you opt in.

After completing steps 1–6 above, add the following under **Settings → Secrets and variables → Actions**:

| Kind     | Name                    | Value                                                                                          |
| -------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| Variable | `ENABLE_DEPLOY`         | `true`                                                                                         |
| Secret   | `CLOUDFLARE_API_TOKEN`  | Cloudflare → My Profile → API Tokens. Start from the "Edit Cloudflare Workers" template and add **D1: Edit** |
| Secret   | `CLOUDFLARE_ACCOUNT_ID` | Shown on the right of Cloudflare → Workers & Pages                                              |

Worker secrets from step 4 are used as-is; nothing else needs to go into GitHub.
To turn it off again, delete `ENABLE_DEPLOY` or set it to anything other than `true`.

## Development

| Command                     | What it does                                                        |
| --------------------------- | ------------------------------------------------------------------- |
| `npm run dev`               | Dev server (Vite + Worker + local D1 on workerd)                    |
| `npm run typecheck`         | Generate `Env` types with `wrangler types`, then `tsc --build`      |
| `npm run build`             | Build `dist/client` (assets) and `dist/poi` (Worker)                |
| `npm run preview`           | Build, then preview in a production-like environment                |
| `npm run deploy`            | Build and `wrangler deploy`                                         |
| `npm run db:generate`       | Generate a migration from schema changes (`drizzle/`)               |
| `npm run db:migrate:local`  | Apply migrations to the local D1                                    |
| `npm run db:migrate:remote` | Apply migrations to the production D1                               |
| `npm run auth:schema`       | Regenerate `worker/db/schema.ts` from the Better Auth config        |

CI (`.github/workflows/ci.yml`) runs `npm run typecheck && npm run build` on every pull request.

```
src/        React SPA (TanStack Router routes, Board component, offline/PWA helpers)
worker/     Hono API, Better Auth, Drizzle schema, cron sweep of expired sections
drizzle/    SQL migrations
public/     PWA icons
docs/       Design notes
```

The design and behaviour in detail — routing, the board editor, the `/api/board` contract, the expiry cron,
PWA caching and offline handling — are documented in [`docs/internals.ja.md`](./docs/internals.ja.md) (Japanese).

## Contributing

Bug reports, feature ideas and pull requests are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).
Please report security issues privately as described in [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE) © Hayashi Naoki
