---
name: d1-schema-changes
description: How to change poi's database schema (Cloudflare D1 / SQLite via Drizzle) safely — where tables are defined (worker/board/schema.ts, the generated worker/auth/schema.ts), generating migrations with npm run db:generate, regenerating Better Auth tables with npm run auth:schema, applying them locally, and writing migrations that survive production's "migrate, then deploy" order. Use when adding, removing, renaming, or changing columns, tables, indexes, or defaults; when editing any schema.ts or anything under drizzle/; when upgrading better-auth or adding a Better Auth plugin; or when a feature needs to persist something new (a per-user setting, a flag, a timestamp) — even if "migration" or "schema" is not mentioned.
---

# Changing the D1 schema

The schema is TypeScript (Drizzle); drizzle-kit turns the diff into SQL files in `drizzle/`, and wrangler applies them.
Production runs **migrations first, then deploys the Worker**, so every migration must work with the Worker that is already running.
Getting this wrong breaks production for everyone, and a pushed migration cannot be taken back — design the change before generating it.

## Where things live

| File | What | Edit by hand? |
|---|---|---|
| `worker/board/schema.ts` | App tables: `memo` (one row per board section), `user_setting`, `board` | Yes — put every app table here |
| `worker/auth/schema.ts` | Better Auth tables (`user`, `session`, `account`, `verification`) | **No.** `npm run auth:schema` overwrites it (it is also excluded from Biome) |
| `drizzle.config.ts` | Points drizzle-kit at both schema files, output `./drizzle` | Rarely |
| `drizzle/NNNN_<name>.sql` + `drizzle/meta/` | Generated migrations, snapshots, `_journal.json` | Only the `.sql`, only before it is pushed (see below) |
| `wrangler.jsonc` `d1_databases` | `migrations_dir: "drizzle"` — wrangler reads the same files | No |
| `worker/db.ts` | Merges both schemas into the Drizzle client | When adding a new schema file |

App tables reference `user.id` with `onDelete: "cascade"` so deleting a user deletes their data. Keep that for new per-user tables.

## Workflow

1. Edit `worker/board/schema.ts` (or run `npm run auth:schema`, below).
2. Generate with a descriptive name — the recent convention is `add_<table>_<column>` / `drop_<table>_<column>` / `add_<table>`:
   ```sh
   npm run db:generate -- --name add_memo_color
   ```
   `worker/board/schema.ts` imports `@shared/constants`; drizzle-kit resolves it through the `paths` in the root `tsconfig.json`. If generate fails with `Cannot find module '@shared/...'`, that entry is missing — fix the config, don't work around it.
   Never hand-write the `.sql`, snapshot, or `_journal.json` to get around a failing generate; the next generate diffs against the snapshot, so a hand-made one corrupts every later migration.
   Commit the `.sql`, the new `meta/NNNN_snapshot.json`, and the `_journal.json` change together, in the same commit as the code that needs them.
3. Read the generated SQL. Check it against the rules below (especially: a table rebuild, a `NOT NULL` without default, a `DROP`).
4. Apply to the local D1 used by `npm run dev` (`.wrangler/state`): `npm run db:migrate:local`. This runs against your existing local rows, which is the closest thing to production data you have.
5. Update code that depends on column order or lists columns (see "Code that must follow the schema").
6. `npm run typecheck && npm run lint && npm test && npm run build`. `worker/board/routes.test.ts` applies every file in `drizzle/` to a fresh in-memory D1, so a migration that does not apply fails `npm test` (and CI).

Never run `db:migrate:remote` or `wrangler deploy` yourself — the Deploy workflow does it after CI passes on main.

### drizzle-kit prompts on renames

If one diff both removes and adds a column/table, `drizzle-kit generate` asks interactively whether it is a rename, which does not work in a non-interactive shell.
History avoided it by splitting into two migrations (0003 `drop_memo_title`, then 0004 `add_memo_position`): change the schema one step, generate, then the next step, generate.
For a real rename, prefer expand/contract (below) over `RENAME COLUMN` — the running Worker still uses the old name.

## Production order: the old Worker sees the new schema

`.github/workflows/deploy.yml` does `npm run build` → `npm run db:migrate:remote` → `wrangler deploy`.
Between the last two steps (and forever, if the deploy step fails), **the previous Worker runs against the new schema**.
On top of that, installed PWAs keep sending requests shaped by the old client until they reload.

So every migration must be **backward compatible with the currently deployed code** — expand/contract:

- **Add** (expand): new tables, or nullable columns / columns with a constant `DEFAULT`. The old Worker ignores them, and its inserts still succeed because the default fills in. Examples: 0004 `position ... DEFAULT 0 NOT NULL`, 0005 `collapsed ... DEFAULT false NOT NULL`, 0007 `user_setting` with `memo_ttl_days DEFAULT 30`, 0008 new `board` table.
- **Drop** (contract): first ship code that no longer reads or writes the column, let it deploy, then drop it in a **later** push.
  Drizzle selects list every column explicitly, so an old Worker whose schema still has the column fails with "no such column" the moment it is gone.
  0003 and 0006 dropped columns in the same commit as the code removal; that was an error window during deploy, not a pattern to copy.
- **Rename / change type** — never a single `RENAME COLUMN` / `DROP`. Several pushes:
  1. Push 1 (expand): add the new column with a default, and in the **same migration** copy existing values (`UPDATE user_setting SET ttl_days = memo_ttl_days;`, appended after a `--> statement-breakpoint`). Without the copy, every existing user silently gets the default once reads switch. Code reads the new column and **writes both**, so the old Worker still sees correct values during the deploy window.
  2. Push 2: re-copy (catches writes the old Worker made between migrate and deploy), stop writing the old column.
  3. Push 3 (contract): drop the old column.
  Keep public API field names (`memoTtlDays` in `/api/settings`) and exported constants unchanged — renaming them breaks installed PWAs and open tabs; a DB column name is internal.
- **API**: new request fields stay optional so old clients keep working (e.g. `revision` in PUT /api/board is `.optional()`, and a missing value means "behave as before").
- A new row-per-user table must treat "no row" as the default (see `user_setting` and `board`), so existing users need no backfill.

Deploys are serialized and never cancelled (`concurrency: deploy-production`) precisely because a cancel could leave migrations applied without the new Worker.

## D1 / SQLite limits (verified on local D1)

- `ALTER TABLE ADD COLUMN` cannot add: `NOT NULL` without a default on a non-empty table, a non-constant default (e.g. `DEFAULT (unixepoch())`), or a `UNIQUE` column.
  0002 (`account.issuer text NOT NULL`, from a Better Auth upgrade) is exactly this shape and fails on any table that has rows. Give the column a default or make it nullable, and add uniqueness with a separate `CREATE UNIQUE INDEX`.
- `DROP COLUMN` and `RENAME COLUMN` work, but anything else (changing type, nullability, default, adding a foreign key) makes drizzle-kit emit a **table rebuild**: `PRAGMA foreign_keys=OFF` → `CREATE TABLE __new_x` → `INSERT ... SELECT` → `DROP TABLE x` → rename → `PRAGMA foreign_keys=ON`.
- **D1 always enforces foreign keys; `PRAGMA foreign_keys=OFF` is silently ignored.** `DROP TABLE` on a parent table therefore fires `ON DELETE CASCADE` on every child, even with `PRAGMA defer_foreign_keys = on`.
  Rebuilding `user` would delete every `memo`, `user_setting`, `board`, `session`, and `account` row. Never rebuild a table that other tables reference; use expand/contract with new columns instead.
  Rebuilding a child table (e.g. `memo`) keeps its rows.
- Data backfills are fine as hand-written SQL appended to a generated migration (or `npm run db:generate -- --custom --name <name>` for an empty file). Separate statements with `--> statement-breakpoint` — the test harness splits on it and prepares each piece separately.
- Queries: at most **100 bound parameters per statement** (`too many SQL variables`). PUT /api/board hit this with 100+ ids in `IN (...)`; it now binds one JSON array and expands it with `json_each` (`worker/board/routes.ts`). Do the same for anything whose parameter count grows with the data.
  A single `db.batch` runs as one transaction; the comment in `routes.ts` also records the per-call query limit (50 Free / 1,000 Paid).

## Better Auth tables

`npm run auth:schema` runs `npx auth@1.7.2 generate` against `better-auth.config.ts` and rewrites `worker/auth/schema.ts`.

- Run it whenever better-auth is upgraded or a Better Auth plugin/option is added or changed, then `npm run db:generate`. An empty diff means no migration is needed (that is how `multiSession` was confirmed to need none).
- **Keep the CLI version pinned to the installed `better-auth` version**: bump `auth@<version>` in the `auth:schema` script together with `better-auth`/`@better-auth/drizzle-adapter`.
  An unpinned CLI once resolved to an old release, generated a schema without `account.issuer`, and every Google login failed in production (commit "Add missing account.issuer column required by better-auth 1.7").
- New columns Better Auth requires are often `NOT NULL` without default — check the generated SQL against the ADD COLUMN limits above before pushing.

## Code that must follow the schema

- `worker/board/routes.ts`: the `insert(memo).select(...)` lists columns **in table-definition order** (a Drizzle constraint). Adding a `memo` column means adding it there in the same position.
- `worker/board/sweep.ts` (hourly Cron, `triggers.crons` in `wrangler.jsonc`) deletes `memo` rows by `expires_at` and relies on `memo_expiresAt_idx`. Keep that column and index, and remember that rows cascade from `user`, not from the sweep.
- `expires_at` is computed in code (`memoExpiresAt` in `shared/constants.ts`), and `memo_ttl_days` defaults to `MEMO_TTL_DAYS`. Values the API validates (`MEMO_TTL_CHOICES`, `BOARD_MAX_SECTIONS`, `BOARD_MAX_LENGTH`) live in `shared/constants.ts`, not in DB constraints; if a new column has limits, put them there so the API and UI share them.
- `worker/board/routes.test.ts` seeds `user` rows with raw SQL (`insert into user (id, name, email)`); a new `NOT NULL` column without a default on a seeded table breaks it.

## Never edit a pushed migration

Once a migration is on main, production has applied it (wrangler records applied migrations by file name and never re-runs them).
Editing or renaming the file afterwards makes local, fresh test databases, and production disagree. Fix mistakes with a new migration.
Before pushing, you may still regenerate: delete the unpushed `.sql` and snapshot, revert `_journal.json`, and run `db:generate` again.

## Checklist

- [ ] Schema edited in `worker/board/schema.ts` (or regenerated via `npm run auth:schema`), migration generated with `--name`
- [ ] Generated SQL read: no parent-table rebuild, no `NOT NULL` without default on existing tables, no drop of anything the deployed Worker still uses
- [ ] Drops are in a later push than the code that stopped using them; new API fields are optional
- [ ] `npm run db:migrate:local` succeeds on existing local data and `npm run dev` still works
- [ ] Column-order-dependent inserts and test fixtures updated
- [ ] `npm run typecheck && npm run lint && npm test && npm run build` pass
- [ ] `.sql`, snapshot, and `_journal.json` committed together with the code; no previously pushed migration modified
