# The Board integration harness

`src/routes/board/-components/board/Board.test.tsx` mounts the whole `Board` in jsdom and checks editor input → sections on screen → autosave PUT end to end. Add Board-level cases to this file instead of starting a second harness, because the fake server and stubs below took several fixes to get right.

## Fake server

`vi.mock("@/lib/api")` replaces `api.board.$put` / `$get` with a small in-memory server (the API is the only out-of-process dependency Board has; everything else runs for real):
- `puts` records each accepted PUT as `{ id, content }[]`. Assert on `puts.at(-1)` for the last save, or `puts` equal to `[]` for "nothing was sent".
- `server = { revision, sections }` is the server's board. A PUT whose `revision` differs gets `409 { error: "Stale" }`, like the real route. To simulate another device saving, overwrite `server` in the test.
- `sessionUserId`: a PUT with a different `userId` gets `409 { error: "UserMismatch" }` (account switched in another tab).
- `expiredOnServer`: ids the server treats as expired and returns as `null` (issue #94).
- New ids come back as `new-<put#>-<n>`.

## Router

Board runs inside a real router: `mount` creates `createTestRouter({ loader })` from `@/lib/router-test` and wraps the tree in `WithRouter`, so `useBlocker` and `router.invalidate()` are the real ones. `loads` counts how often the current page's data was reloaded (e.g. `expect(loads).toBe(1)` after the account was switched in another tab).

## Helpers

| Helper | What it does |
|---|---|
| `mount(sections, ttlDays?)` | Creates the root and the router (resets `loads`), fills defaults (`id-<i>`, far-future `expiresAt`), sets `server` to revision `r0`, renders inside `WithRouter` + `MantineProvider` + `HeaderSlotProvider` / `HeaderSlotTarget` |
| `render(ttlDays)` | Re-renders with the same initial sections (e.g. retention days changed); Board is not recreated |
| `addSection()` | Clicks the header's `セクションを追加` button |
| `editor()` / `type(text)` / `key(k)` | Gets the focused CodeMirror view, inserts at the cursor with `userEvent: "input.type"`, or dispatches a keydown on `contentDOM` |
| `sectionTexts()` | Each section's text: the editor doc if editing, otherwise the rendered Markdown's text |
| `waitForSave()` | Waits 1100 ms with real timers (autosave fires 1000 ms after input stops) |

`beforeEach` resets `puts`, `sessionUserId`, `expiredOnServer`, clears `localStorage`, and writes the cached user `u` (the offline cache is only written for the signed-in user).

## Limits

jsdom has no layout. Rects are empty, and `scrollBy` / `scrollTo` / `scrollIntoView` are no-ops. Anything about scroll placement, visual lines, or what is on screen cannot be asserted here. Test the underlying pure function if there is one, and check the rest in the running app.
