---
name: writing-tests
description: How to write and run tests in poi (Vitest 4, node by default, jsdom per file) — which kind of test fits (pure unit test of extracted logic, jsdom test of a hook or of the whole Board with CodeMirror, worker route test against a real local D1), how to mock the API / router / auth client, the commands for one file, one test name, watch mode and the full pre-commit check, and the regression-test habit for bug fixes. Use when adding, fixing, or running tests; when fixing a bug in src/ or worker/ (it probably deserves a regression test); when adding logic to worker/, src/, or shared/; when a test fails or is flaky; or when asked "テスト書いて" / "テスト追加して" — even if tests are not mentioned explicitly. Not for building new test infrastructure such as a Playwright / e2e setup in CI.
---

# Writing tests in poi

Tests are Vitest 4, configured in `vitest.config.ts`: one project, **node environment by default**, `@/`, `@worker/`, `@shared/` resolved from tsconfig paths.
Collected files: `src/**/*.test.{ts,tsx}`, `worker/**/*.test.ts`, `shared/**/*.test.ts`. Nothing else runs (a `worker/**/*.test.tsx` would be silently skipped).
There is no setup file and no Testing Library; each test file sets up what it needs, so read a neighbouring test before writing a new one.

Placement (next to the file under test as `<name>.test.ts(x)`, moving with it) is covered by the `route-colocation` skill for src/ and `worker-structure` for worker/. Don't restate it here.

Test titles and comments are in Japanese, describing the behaviour (`"古い版をもとにした保存は断り、別の場所で保存した内容を残す (issue #72)"`). Follow that.

## Pick the kind of test

Prefer the cheapest test that can catch the bug. Put logic where the cheap test can reach it.

| What changed | Test | Examples |
|---|---|---|
| Decision logic (diffing, merging, splitting, limits, parsing) | Pure unit test, node env, no mocks | `worker/board/board-sync.test.ts`, `src/routes/(board)/-lib/sections/board-ops.test.ts`, `.../data/board.test.ts`, `.../editor/minimal-change.test.ts`, `worker/auth/in-app-browser.test.ts` |
| Something needing DOM / localStorage / a CodeMirror view | Unit test with `// @vitest-environment jsdom` | `.../editor/list-editing.test.ts`, `.../data/board-cache.test.ts`, `.../markdown/markdown-source-offset.test.ts` |
| A hook or loader that talks to the API, router, or auth client | jsdom + `vi.mock` of those modules | `src/routes/(root)/-lib/use-account-actions.test.tsx`, `.../data/board-loader.test.ts` |
| Editing → sections on screen → autosave PUT, conflicts, expiry | jsdom integration test of the whole `Board` | `src/routes/(board)/-components/board/Board.test.tsx` |
| A worker route's SQL, D1 limits, status codes | Route test against local D1 via `getPlatformProxy` | `worker/board/routes.test.ts` |

### Extract pure functions first

The repo's habit is to pull logic out of React components and route handlers into pure functions, then unit-test those:
- `planBoardSync` (`worker/board/board-sync.ts`): "DB に触らない純粋関数にして、ルートはこの結果を batch にするだけ". Nondeterminism is injected (`expiredCreatedAt`, `newId`) so the test pins ids as `n1, n2, ...`.
- `board-ops.ts`: section-array edits as pure functions; Board only applies the result.
- `minimalChange`, `splitAtSeparator`, `toPutPayload`, `applySaved`, `pruneExpired`, ... in `-lib/`.
- `section-markdown.ts` is kept free of React so its parser and decorations can be tested alone (its doc comment says so).

When a fix touches a component or route, first ask whether the decision can move into such a function. Pure tests run in milliseconds (`board-sync.test.ts`: ~70 ms) while the Board suite takes seconds because it waits on real timers.
Pass time and ids in as parameters instead of calling `Date.now()` / `crypto.randomUUID()` inside, so tests need no fake timers or stubs.

## jsdom tests (hooks, Board, CodeMirror)

- Put `// @vitest-environment jsdom` on **line 1**. Without it the file runs in node and `document` / `localStorage` are undefined.
- Render with `createRoot` + `act` from `react`, and set `globalThis.IS_REACT_ACT_ENVIRONMENT = true` in `beforeAll`. To test a hook, render a tiny `Probe` component that stores the hook's return value in a module variable (`use-account-actions.test.tsx`).
- Components using Mantine need `<MantineProvider>`; Board also needs `HeaderSlotProvider` + `HeaderSlotTarget` because its add button lives in the header slot.
- jsdom lacks layout, so Board.test stubs `matchMedia`, `ResizeObserver`, `scrollIntoView`, `Range.getClientRects` / `getBoundingClientRect` (CodeMirror's `coordsAtPos`), `scrollBy` / `scrollTo`. Copy that `beforeAll` block when mounting a component tree that includes CodeMirror or Mantine. Scroll position and visual-line behaviour cannot be tested here; that is why scroll fixes (e.g. #93) shipped without tests.
- Drive CodeMirror through its API, not synthetic typing: find the view with `EditorView.findFromDOM(container.querySelector(".cm-editor"))`, then `view.dispatch({ changes, selection, userEvent: "input.type" })`, or dispatch a `KeyboardEvent("keydown")` on `view.contentDOM` for keymap commands. For editor commands alone, create a bare `EditorView` with a `|` cursor marker and destroy it in `afterEach` (`list-editing.test.ts`).
- Timers are real in component tests; the only `vi.useFakeTimers` is `use-undoable-delete.test.tsx`, a hook test that fakes just `setTimeout` / `clearTimeout` to step through the 8 s undo toast without waiting (don't fake timers around CodeMirror or the Board). Board.test waits for autosave (`AUTOSAVE_DELAY_MS = 1000` in `use-board-autosave.ts`) with `waitForSave()` = `act` + a 1100 ms `setTimeout`. If you change the delay, change that helper.
- Reset shared state in `beforeEach`: `localStorage.clear()`, mock state, `mockReset` / `vi.clearAllMocks()`. Unmount in `afterEach`; if a test unmounts itself, create a fresh root for `afterEach` (see "自動保存を待たずに離れても").

More detail on the Board harness (fake server, helpers): [references/board-harness.md](references/board-harness.md).

## Mocking

Mock at the module boundary the code imports, never deeper:
- The API: `vi.mock("@/lib/api", () => ({ api: { board: { $get, $put } } }))` returning `{ ok, status, json: async () => body }` like a `fetch` Response.
- The router: `vi.mock("@tanstack/react-router", () => ({ useRouter: () => router, useBlocker: () => {} }))` with only what the code uses.
- Auth: `vi.mock("@/lib/auth-client", ...)`.

Rules the existing tests follow:
- `vi.mock` factories are hoisted above everything. If the factory **reads** a variable when it runs (`() => ({ clearOfflineCaches })`), create that variable with `vi.hoisted(() => vi.fn())`, or it is not initialised yet. Variables only read later inside a function (Board.test's `puts`, `server`) can stay plain `const`/`let`.
- After the mocks, load the module under test with top-level `const { X } = await import("./x")` (Board.test, board-loader.test, use-account-actions.test).
- **`vi.mock` on a path that doesn't exist is not an error** — the test runs against the real module and may still pass. After moving or renaming files run `node .claude/skills/route-colocation/scripts/check-placement.mjs`, which flags unresolved `vi.mock` paths.
- Don't mock D1. `worker/board/routes.test.ts` runs against local D1 because it enforces production's limits: `18eac46` (#76) fixed saves failing on D1's 100-bound-parameter limit and added a 1,000-section route test.

### Boundary tests

When pinning a comparison (`<=` vs `<`, a limit, an expiry), test the exact boundary **and** the values one step on each side (`now - 1`, `now`, `now + 1` ms; `LIMIT - 1`, `LIMIT`, `LIMIT + 1`), not a far-away fixture. Then flip the operator briefly to see the boundary test fail, and restore it — a boundary test that passes both ways pins nothing.

## Worker route tests

`worker/board/routes.test.ts` is the template:
1. `getPlatformProxy<Env>({ persist: false })` from `wrangler` in `beforeAll` (60 s timeout), then apply every `drizzle/*.sql` split on `--> statement-breakpoint`. `proxy.dispose()` in `afterAll`.
2. Build a test app: `new Hono<AppEnv>().use(...set fixed "user" / "session"...).route("/", boardRoutes)`. This skips better-auth sessions entirely.
3. Call `app.request(path, init, { DB: db })` — the third argument is the Env bindings.
4. Reset rows in `beforeEach` (delete from `user`, re-insert the fixed user; child rows cascade) and assert both the response and the rows read back with `db.prepare(...)`.

Keep the SQL decision in a pure function tested separately (`board-sync.test.ts`); the route test covers what only a real DB shows: batching, limits, concurrency (`Promise.all` of two PUTs → one 200, one 409), JSON round-trips.
Backend layout rules are in the `worker-structure` skill.

## Regression tests for bug fixes

Since tests arrived (2026-09-22), most bug-fix commits that change logic add a test in the same commit, at every layer the bug crossed. The few that didn't (`f91bda0` #73, `347ce8e` #75) left those paths uncovered, so don't copy them. For example:
- `c47b800` (#94, expiry under a shortened period): `board-sync.test.ts`, `routes.test.ts`, `board.test.ts`, and `Board.test.tsx`.
- `9dfedad` (line-wise indent): `list-editing.test.ts`. `ebaaf3d` (undo after edit): `board-ops.test.ts`. `95be49d` (stale cache): `board-loader.test.ts`.

Do the same: write the failing test first, see it fail, then fix. Put the issue number in the `it` / `describe` title when there is one (`(issue #72)`) — only a number you were given or confirmed with `gh issue view`; never guess one. Visual, CSS, and scroll/layout fixes are the accepted exceptions because jsdom has no layout. Say so in the report instead of skipping silently.

## Commands

```sh
npm test                                   # all files once (vitest run), ~16 s
npx vitest run worker/board/board-sync     # one file (path substring filter)
npx vitest run Board.test.tsx -t "issue #94"  # tests whose name matches
npx vitest worker/board                    # watch mode (reruns on save)
npm test -- worker/board/routes            # same filter through the npm script
```

File filters are case-insensitive substrings of the path: `npx vitest run Board` runs 14 of 16 files and `Board.test` also picks up `board.test.ts`. Be specific.

Before committing, run the same checks as CI (`.github/workflows/ci.yml` runs lint, typecheck, test, build):

```sh
npm run typecheck && npm run lint && npm test && npm run build
```

`npm run lint` is Biome over the whole repo (including `.claude/`), and formatting counts. Run `npm run lint:fix` for format-only findings.
