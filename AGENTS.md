# poi

A memo pad whose sections delete themselves 30 days (configurable per user) after they were written.
One Cloudflare Worker serves both the React SPA and the Hono API, backed by D1. See README.md for the stack.

## Layout

- `src/` — frontend (React 19, TanStack Router, Mantine, CodeMirror 6). Files are colocated along routes.
- `worker/` — backend (Hono on a Cloudflare Worker): `auth/` (Better Auth) and `board/` (sections, settings, cron).
- `shared/` — constants and pure helpers used by both sides (import as `@shared/...`).
- `drizzle/` — generated D1 migrations.

## Commands

- `npm run dev` — Vite + Worker dev server on :5173 with local D1 (`scripts/dev-server.sh start` keeps it running).
- `npm test` / `npm run lint` / `npm run typecheck` / `npm run build` — run all four before committing (CI runs the same).
- `npm run lint:fix` — Biome format and autofix.

## Conventions

- Code comments and UI copy are in Japanese; identifiers are in English.
- Commit messages are in English: a capitalised imperative subject (≤ 100 chars, no trailing period), a blank line,
  then a body explaining why. Reference issues with `Closes #N` / `Refs #N`. commitlint enforces this
  (`commitlint.config.js`, via a husky hook and CI).
- Bug fixes come with a regression test where practical.

## Topic guides

Detailed guides live in `.claude/skills/<name>/SKILL.md`. Read the relevant one before working in its area:

- `route-colocation` — where files go under `src/`.
- `poi-ui-conventions` — look, shared UI pieces, Japanese copy style, accessibility and mobile rules.
- `worker-structure` — layout of `worker/` and `shared/`, adding API endpoints, auth, cron, bindings.
- `d1-schema-changes` — changing tables and writing migrations.
- `writing-tests` — Vitest setup, which kind of test to write, how to run them.
- `verifying-in-app` — launching the app and checking a change in a real browser.
