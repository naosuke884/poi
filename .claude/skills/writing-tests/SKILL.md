---
name: writing-tests
description: How to write and run tests in poi, following the classical (Detroit) school — test units of behaviour, keep in-process collaborators real, replace only out-of-process dependencies with stateful fakes, assert outcomes instead of calls. Covers which kind of test fits (pure test of a module's domain functions, jsdom test of a hook / component / the whole Board with a real router, worker route test on a fresh local D1 per test), the fake API / auth server, the test-router helper, the D1 fixture, commands for one file, one test name, watch mode and the pre-commit check, and regression tests for bug fixes. Use when adding, fixing, reviewing, or running tests; when fixing a bug in src/ or worker/; when adding logic to worker/, src/, or shared/; when deciding whether to mock something (vi.mock, vi.fn, spies); when a test fails or is flaky; or when asked "テスト書いて" / "モックどうする？" — even if tests are not mentioned. Not for building new test infrastructure such as Playwright / e2e in CI.
---

# Writing tests in poi

Tests are Vitest 4, configured in `vitest.config.ts`: one project, **node environment by default**, `@/`, `@worker/`, `@shared/` resolved from tsconfig paths.
Collected files: `src/**/*.test.{ts,tsx}`, `worker/**/*.test.ts`, `shared/**/*.test.ts`. Nothing else runs (a `worker/**/*.test.tsx` would be silently skipped).
There is no setup file and no Testing Library; each test file sets up what it needs, so read a neighbouring test before writing a new one.

Placement (next to the file under test as `<name>.test.ts(x)`, moving with it) is covered by the `route-colocation` skill for src/ and `worker-structure` for worker/.

Test titles and comments are in Japanese. A title states the behaviour the test pins (`"古い版をもとにした保存は断り、別の場所で保存した内容を残す (issue #72)"`), so the list of titles reads as the spec. Name the behaviour, not the function or the mechanism.

## The stance: classical school

The project follows the classical (Detroit) school of unit testing. Everything below follows from three rules.

1. **A test checks a unit of behaviour, not a unit of code.** One behaviour may run through several modules, hooks and components. The *tests* are isolated from each other (no shared state, any order). The *code under test* is not isolated from its collaborators.
2. **In-process collaborators are real.** Our own modules, React components (children included), TanStack Router, localStorage, CodeMirror, Mantine all run for real. Replace only dependencies that live **outside the process**:
   - From the frontend: the Worker API (`@/lib/api`) and the Better Auth client (`@/lib/auth-client`), which talk HTTP. Replace them with a **stateful fake server** (below).
   - From the worker: D1 is out of process, but only this app uses it, so it is not faked. Each test gets its own fresh local D1 (below). Mocking it would hide production limits: `18eac46` (#76) fixed saves failing on D1's 100-bound-parameter limit, which only a real D1 shows.
3. **Assert outcomes, not calls.** Check return values, state (D1 rows, the fake server's data, localStorage, `router.state.location`), and what is on screen. Don't check that a collaborator was called with certain arguments.

**Why:** a test that pins internal calls fails when the code is refactored even though nothing a user could notice changed. It also passes when the calls are made but the outcome is wrong. Tests that only see outcomes fail when, and only when, behaviour changes.

What still uses `vi.fn()` / stubs, and why it fits the rules:
- **Callbacks the caller passes in** (`onClose`, `onSaved`, `onConfirm`, a hook's `back`) are the unit's outputs to its caller. `expect(onClose).toHaveBeenCalledTimes(1)` asserts an outcome.
- **A fake server's request log** (`puts` in Board.test, or "no request was sent") is a side effect visible at the system boundary. Assert on the log, not on `vi.fn` call records.
- **Browser APIs jsdom lacks** (`matchMedia`, `ResizeObserver`, `scrollIntoView`, `Range.getClientRects`, `scrollTo`). Stubbing the platform is not mocking our code.
- **Time** is a dependency outside our control. Prefer passing `now` / ids in as parameters. Where code reads the clock itself, fake only what the test needs: `use-undoable-delete.test.tsx` fakes `setTimeout` / `clearTimeout` to step through the 8 s undo toast, and `board-loader.test.ts` fakes `Date` to move the clock during a fetch. Never fake timers around CodeMirror or the Board.

What not to do: `vi.mock` of our own module (`./board/Board`, `@/lib/offline-caches`) or of the router; spying on a library to count its calls; exporting a module's internal helper only so a test can call it.

## Pick the kind of test

Prefer the cheapest test that observes the behaviour.

| What changed | Test | Examples |
|---|---|---|
| Domain decisions: diffing, merging, splitting, limits, parsing, expiry | Pure test of the functions the module exports for real callers. Node env, no doubles | `worker/board/board-sync.test.ts`, `src/routes/board/-lib/sections/board-ops.test.ts`, `.../data/board.test.ts`, `.../editor/minimal-change.test.ts`, `worker/auth/in-app-browser.test.ts` |
| Something needing DOM / localStorage / a CodeMirror view | Same, with `// @vitest-environment jsdom` | `.../editor/list-editing.test.ts`, `.../data/board-cache.test.ts`, `.../markdown/markdown-source-offset.test.ts` |
| A hook, component or loader that talks to the API, auth or router | jsdom, real router (`@/lib/router-test`), fake server for API / auth | `src/routes/(root)/-lib/use-account-actions.test.tsx`, `.../header/user-menu/TtlSettingModal.test.tsx`, `.../data/board-loader.test.ts`, `OfflineBanner.test.tsx` |
| Editing → sections on screen → autosave PUT, conflicts, expiry | jsdom integration test of the whole `Board` | `src/routes/board/-components/board/Board.test.tsx` ([harness](references/board-harness.md)) |
| A worker route's SQL, D1 limits, status codes | Route test on a fresh local D1 per test | `worker/board/routes.test.ts` |
| Worker wiring in `index.ts` (Better Auth handler, headers on every response) | `worker.fetch` on a fresh local D1, test secrets, signed session cookie | `worker/index.test.ts` |

### Domain logic as pure functions

The repo keeps decisions in pure functions and leaves components and routes as thin shells that apply the result. Examples: `planBoardSync` in `worker/board/board-sync.ts` ("DB に触らない純粋関数にして、ルートはこの結果を batch にするだけ"), the section-array edits in `board-ops.ts`, `minimalChange`, `splitAtSeparator`, `pruneExpired`.
These exported functions are the domain's public API, so testing them directly is testing behaviour. Such tests run in milliseconds and can pin edge cases a route or Board test reaches only slowly.

- Test a module through the functions its real callers use. If a helper is exported only so a test can reach it, test it through its caller instead and keep it private.
- Assert the result as a whole (`toEqual` on the plan / the new array), not intermediate steps.
- Pass time and ids in as parameters (`now`, `expiredCreatedAt`, `newId`) instead of calling `Date.now()` / `crypto.randomUUID()` inside. Then tests pin them (`n1, n2, ...`) with no fake timers or stubs.

When a fix touches a component or route, first ask whether the decision belongs in such a function. Then test it there, plus one test at the outer layer that shows the behaviour end to end.

## Fake servers for the API and auth

Replace `@/lib/api` / `@/lib/auth-client` at the module the code imports, with an in-memory server that holds data and answers like the real one. The exemplar is `TtlSettingModal.test.tsx`:

```ts
// API の向こうのサーバー (プロセスの外にあるので、ここだけ偽物にする)
const server = vi.hoisted(() => ({
  memoTtlDays: 30,
  sections: [] as { createdAt: string }[],
  reply: {} as Partial<Record<"settingsGet" | "settingsPut" | "boardGet", "ok" | "error" | "offline">>,
}));
vi.mock("@/lib/api", () => { /* $get / $put read and write `server`, honour `reply` */ });
// …
expect(server.memoTtlDays).toBe(7); // not: expect(put).toHaveBeenCalledWith(...)
```

- Responses look like `fetch` Responses: `{ ok, status, json: async () => body }`. `"offline"` throws `TypeError("Failed to fetch")`, and `"error"` returns `ok: false, status: 500`.
- Make the fake follow the real server's rules that the code depends on. For example, Board.test's fake returns 409 `Stale` / `UserMismatch` like the real route. Another device saving is shown by rewriting `server`.
- Reset `server` in `beforeEach`.
- Auth: `use-account-actions.test.tsx` keeps the device's sessions, the active token and the users, and asserts what remains after logout / switch / delete.

`vi.mock` mechanics:
- Factories are hoisted above everything. A variable the factory **reads while it runs** must come from `vi.hoisted(...)`. Variables read only later, inside the fake's functions, can be plain `let` / `const`.
- After the mocks, load the module under test with top-level `const { X } = await import("./x")`.
- **`vi.mock` on a path that doesn't exist is not an error**: the test silently runs against the real module. After moving or renaming files, run `node .claude/skills/route-colocation/scripts/check-placement.mjs`, which flags unresolved `vi.mock` paths.

## Real router: `@/lib/router-test`

Never mock `@tanstack/react-router`. Wrap the tree in a real router:

```tsx
const router = createTestRouter({ initialPath: "/board", loader: () => void loads++ });
await router.load();
loads = 0;
root.render(<WithRouter router={router}>{/* the component */}</WithRouter>);
// …
expect(router.state.location.pathname).toBe("/"); // navigated home
expect(loads).toBe(1);                            // data reloaded (router.invalidate())
```

`WithRouter` passes only the router context (`RouterContextProvider`), so the component renders as is. It works with `Link`, `useRouter`, `useBlocker`, `useRouterState`. To test a page's routing itself (focus on navigation, route components), build a small route tree with `createRouter` + `RouterProvider`, as `use-focus-on-navigate.test.tsx` does.

## jsdom tests (hooks, components, Board, CodeMirror)

- Put `// @vitest-environment jsdom` on **line 1**. Without it the file runs in node and `document` / `localStorage` are undefined.
- Render with `createRoot` + `act` from `react`, and set `globalThis.IS_REACT_ACT_ENVIRONMENT = true` in `beforeAll`. To test a hook, render a tiny `Probe` component that stores the hook's return value in a module variable (`use-account-actions.test.tsx`).
- Components using Mantine need `<MantineProvider>`. Board also needs `HeaderSlotProvider` + `HeaderSlotTarget`, because its add button lives in the header slot.
- jsdom lacks layout. Copy Board.test's `beforeAll` stubs when mounting anything with CodeMirror or Mantine. Scroll position and visual-line behaviour cannot be tested in jsdom: check them in the running app (`verifying-in-app` skill).
- Drive CodeMirror through its API, not synthetic typing. Find the view with `EditorView.findFromDOM(container.querySelector(".cm-editor"))`, then `view.dispatch({ changes, selection, userEvent: "input.type" })`, or dispatch a `KeyboardEvent("keydown")` on `view.contentDOM` for keymap commands. For editor commands alone, create a bare `EditorView` with a `|` cursor marker and destroy it in `afterEach` (`list-editing.test.ts`).
- Timers are real in component tests. Board.test waits for autosave (`AUTOSAVE_DELAY_MS = 1000` in `use-board-autosave.ts`) with `waitForSave()`, which is `act` + a 1100 ms `setTimeout`. If you change the delay, change that helper.
- Reset shared state in `beforeEach`: `localStorage.clear()`, the fake server. Unmount in `afterEach`. If a test unmounts itself, create a fresh root for `afterEach` (see "自動保存を待たずに離れても").

## Worker tests on a fresh D1 per test

`worker/d1-test.ts` exports `test`, Vitest's `test` extended with a `db` fixture. A test that takes `db` gets a new local D1 (`getPlatformProxy({ persist: false })`, workerd's SQLite with production's limits) with every `drizzle/*.sql` migration applied, and it is disposed when the test ends.
Nothing carries over between tests, so there is no `beforeEach` cleanup. Each D1 costs about 0.3 s, and fixtures are lazy: a test that doesn't take `db` doesn't start one.

`worker/board/routes.test.ts` is the template:
1. Build each file's own fixtures on top with the builder form, e.g. `const it = test.extend("board", async ({ db }) => { /* insert the user */ return boardClient(db); })`. Keep per-test state such as the last revision inside the fixture, not in module variables.
2. Mount the sub-app in a test Hono app whose middleware sets a fixed `user` / `session`, then call `app.request(path, init, { DB: db })`. The third argument is the Env bindings. `index.test.ts` instead builds `env` / `request` / `signIn` fixtures and calls `worker.fetch` so Better Auth's real handler runs.
3. Assert both the response and the rows read back with `db.prepare(...)`.
4. Tests run with `describe.concurrent`, because every test has its own D1. With concurrency, use the `expect` from the test context for snapshots and `expect.assertions`.
5. `it.each` can't receive fixtures. Use `it.for([...])("%s …", async ([a, b], { request }) => …)`.

The route test covers what only a real DB shows: batching, limits, concurrency (`Promise.all` of two PUTs gives one 200 and one 409), JSON round-trips. Edge cases of the decision itself belong in the pure test (`board-sync.test.ts`).
Backend layout rules are in the `worker-structure` skill.

## Boundary tests

When pinning a comparison (`<=` vs `<`, a limit, an expiry), test the exact boundary **and** one step on each side (`now - 1`, `now`, `now + 1` ms; `LIMIT - 1`, `LIMIT`, `LIMIT + 1`), not a far-away fixture.
Then flip the operator briefly, see the boundary test fail, and restore it. A boundary test that passes both ways pins nothing.
The same check works for any new assertion: break the production line, watch the test fail, restore it.

## Regression tests for bug fixes

Since tests arrived (2026-09-22), bug-fix commits that change logic add a test in the same commit, at every layer the bug crossed. For example, `c47b800` (#94, expiry under a shortened period) added tests in `board-sync.test.ts`, `routes.test.ts`, `board.test.ts` and `Board.test.tsx`.

Write the failing test first, see it fail, then fix.
Put the issue ID in the `it` / `describe` title when there is one (`(HAY-12)`; older tests use GitHub numbers such as `(issue #72)`), but only an ID you were given or confirmed in Linear. Never guess one.
Visual, CSS and scroll/layout fixes are the accepted exceptions, because jsdom has no layout. Say so in the report instead of skipping silently.

## Commands

```sh
npm test                                   # all files once (vitest run), ~18 s
npx vitest run worker/board/board-sync     # one file (path substring filter)
npx vitest run Board.test.tsx -t "issue #94"  # tests whose name matches
npx vitest worker/board                    # watch mode (reruns on save)
npm test -- worker/board/routes            # same filter through the npm script
```

File filters are case-insensitive substrings of the path: `npx vitest run Board` picks up many files, and `Board.test` also matches `board.test.ts`. Be specific.

Before committing, run the same checks as CI (`.github/workflows/ci.yml` runs lint, typecheck, test, build):

```sh
npm run typecheck && npm run lint && npm test && npm run build
```

`npm run lint` is Biome over the whole repo (including `.claude/`), and formatting counts. Run `npm run lint:fix` for format-only findings.
