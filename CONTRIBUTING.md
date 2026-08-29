# Contributing to poi

Thanks for your interest! Issues and pull requests are welcome, in English or Japanese.

## Reporting bugs / proposing features

Open an [issue](https://github.com/naosuke884/poi/issues). For bugs, include what you did, what you expected,
what happened, and your browser / OS (poi is a PWA, so mobile browsers matter).

poi is deliberately small: one board, sections that expire in 30 days, a Markdown subset, Google sign-in.
Feature requests that keep it small are the easiest to accept — please open an issue to discuss before
building anything large.

## Development setup

See [Self-hosting → Run locally](./README.md#run-locally). In short:

```sh
npm install
cp .dev.vars.example .dev.vars   # Google OAuth client + a random secret
npm run db:migrate:local
npm run dev
```

How the board editor, the `/api/board` contract, the expiry cron and the offline handling work is explained
in comments at the top of the relevant files (`src/components/Board.tsx`, `worker/memo/routes.ts`,
`worker/memo/sweep.ts`, `src/routes/index.tsx`, `vite.config.ts`) — worth skimming before changing them.

## Before opening a pull request

- Run `npm run typecheck && npm run build`. CI runs exactly this on every PR and must be green.
- There is no automated test suite yet. Please describe in the PR how you verified the change
  (browser, device, offline mode, etc.).
- Keep pull requests focused on one change. Commit messages follow the style already in the log:
  a short imperative summary, prefixed with the area when useful (e.g. `Board: keep focus after merging sections`).
- If you change the database schema: edit `worker/db/memo.ts` (or run `npm run auth:schema` for Better Auth
  changes — never hand-edit the generated `worker/db/schema.ts`), run `npm run db:generate`, apply it with
  `npm run db:migrate:local`, and commit the generated migration in `drizzle/`.
- Do not add `runtimeCaching` for `/api/*` to the service worker — authenticated responses must never be cached.
- Do not commit secrets. `.dev.vars` is git-ignored; `wrangler secret put` is used in production.

## Code style

TypeScript strict mode throughout. Comments in the codebase are mostly Japanese; either language is fine in
new code, as long as the comment explains *why* rather than *what*.

## License

By contributing you agree that your contributions are licensed under the [MIT License](./LICENSE).
