# poi

[![CI](https://github.com/naosuke884/poi/actions/workflows/ci.yml/badge.svg)](https://github.com/naosuke884/poi/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[日本語版 README](./README.ja.md)

**poi** is a single-page scratchpad for the things you only need for a little while.
Sign in with Google at [poinote.app](https://poinote.app/) and start right away.

https://github.com/user-attachments/assets/aa770060-e391-4936-a1c9-59fb785dfbf3

## Features

- **Every section is force-deleted after 30 days** — a memo that's 30 days old has outlived its purpose; if you need it again, just write it again
- **Structure with Markdown** — even a quick memo is nicer to read with a little structure, right?
- **Per-section copy and screenshot** — sharing a memo in one click is handy, isn't it?
- **Per-section collapse and one-click delete** — a memo you've lost interest in can vanish from your view (or from the world) right away, master
- **PWA** — surely you know the trick that lets a web app open like a native one?

## Tech stack

| Layer     | Choice                                                                     |
| --------- | -------------------------------------------------------------------------- |
| Runtime   | [Cloudflare Workers](https://workers.cloudflare.com/) + [D1](https://developers.cloudflare.com/d1/) (SQLite) + Cron Triggers |
| API       | [Hono](https://hono.dev/) with typed RPC client, [Zod](https://zod.dev/) validation |
| Auth      | [Better Auth](https://www.better-auth.com/) (Google OAuth)                  |
| DB        | [Drizzle ORM](https://orm.drizzle.team/) + drizzle-kit migrations           |
| Frontend  | React 19, [TanStack Router](https://tanstack.com/router), [Mantine](https://mantine.dev/), [react-markdown](https://github.com/remarkjs/react-markdown), [CodeMirror 6](https://codemirror.net/) (editor) |
| Build     | [Vite](https://vite.dev/) + `@cloudflare/vite-plugin` + `vite-plugin-pwa`  |

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
```

How things work — the board editor, the `/api/board` contract, the expiry cron, PWA caching and offline
handling — is explained in comments at the top of the relevant files (`src/components/Board.tsx`,
`src/components/SectionEditor.tsx`, `src/lib/section-markdown.ts`,
`worker/memo/routes.ts`, `worker/memo/sweep.ts`, `vite.config.ts`, `src/routes/index.tsx`).

## Contributing

Bug reports, feature ideas and pull requests are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).
Please report security issues privately as described in [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE) © Hayashi Naoki
