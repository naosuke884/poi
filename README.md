# poi

[![CI](https://github.com/naosuke884/poi/actions/workflows/ci.yml/badge.svg)](https://github.com/naosuke884/poi/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**poi** is a note that disappears in 30 days.
Sign in with Google at [poinote.app](https://poinote.app/) and start right away.

https://github.com/user-attachments/assets/b54ecc35-68ed-4000-9c2e-ae42d4a45f12

## Features

- **Every section is force-deleted after 30 days (the period is configurable)** — a memo that's 30 days old has served its purpose; if you ever need it again, just write it again
- **Structure with Markdown** — even a quick memo is easier to read with a little structure
- **Per-section copy and screenshot** — sharing a memo takes one click
- **One-click delete** — a memo you no longer care about is gone for good in one click
- **PWA** — install it like a native app; the last board stays readable offline

## Tech stack

| Layer     | Choice                                                                     |
| --------- | -------------------------------------------------------------------------- |
| Runtime   | [Cloudflare Workers](https://workers.cloudflare.com/) + [D1](https://developers.cloudflare.com/d1/) (SQLite) + Cron Triggers |
| API       | [Hono](https://hono.dev/) with typed RPC client, [Zod](https://zod.dev/) validation |
| Auth      | [Better Auth](https://www.better-auth.com/) (Google OAuth)                  |
| DB        | [Drizzle ORM](https://orm.drizzle.team/) + drizzle-kit migrations           |
| Frontend  | React 19, [TanStack Router](https://tanstack.com/router), [Mantine](https://mantine.dev/), [react-markdown](https://github.com/remarkjs/react-markdown), [CodeMirror 6](https://codemirror.net/) (editor) |
| Build     | [Vite](https://vite.dev/) + `@cloudflare/vite-plugin` + `vite-plugin-pwa`  |
| Test      | [Vitest](https://vitest.dev/) (+ jsdom)                                     |

## Contributing

Bug reports, feature ideas and pull requests are welcome.

## License

[MIT](./LICENSE) © Hayashi Naoki
