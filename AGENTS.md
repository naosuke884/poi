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
- `npm run test:a11y` — Playwright + axe accessibility check of the rendered pages (starts its own dev server on :5174; CI job `a11y`).

## Conventions

- Code comments and UI copy are in Japanese; identifiers are in English.
- Each place records a different thing, so don't repeat one in another:
  - Code says **how**: make it readable on its own (names, structure) rather than narrating it in comments.
  - Tests say **what**: name each test after the behaviour it pins down, so the list of names reads as the spec.
  - Commit messages say **why**: the reason for the change, which the diff cannot show.
  - Code comments say **why not**: the obvious alternative and why it was not taken (a constraint, a bug it would cause, an issue number).
- Commit messages follow Conventional Commits with a Japanese subject (identifiers stay as they are):
  `type(scope): subject` where type is one of `feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `ci` /
  `build` / `perf` / `style` / `revert`, scope is optional (e.g. `board`, `auth`), and the subject is a plain-form
  sentence saying what the commit does (header ≤ 100 chars, no trailing `。` or `.`,
  e.g. `feat(board): セクションの並べ替えを追加する`). Then a blank line and a body explaining why.
  Reference issues with `Closes #N` / `Refs #N`. commitlint checks the shape (`commitlint.config.js`,
  `@commitlint/config-conventional`, via a husky hook and CI), not the language or wording.
  Commits before 2026-10-10 don't use this format; don't copy them.
- Bug fixes come with a regression test where practical.

## Topic guides

Detailed guides live in `.claude/skills/<name>/SKILL.md`. Read the relevant one before working in its area:

- `route-colocation` — where files go under `src/`.
- `poi-ui-conventions` — look, shared UI pieces, Japanese copy style, accessibility and mobile rules.
- `worker-structure` — layout of `worker/` and `shared/`, adding API endpoints, auth, cron, bindings.
- `d1-schema-changes` — changing tables and writing migrations.
- `writing-tests` — Vitest setup, which kind of test to write, how to run them.
- `verifying-in-app` — launching the app and checking a change in a real browser.
