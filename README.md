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

## Contributing

Bug reports, feature ideas and pull requests are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).
Please report security issues privately as described in [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE) © Hayashi Naoki
