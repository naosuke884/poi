# The Board integration harness

`src/routes/board/-components/board/Board.test.tsx` mounts the whole `Board` in jsdom and checks editor input → sections on screen → autosave PUT end to end. Add Board-level cases to this file instead of starting a second harness, because the fake server and stubs below took several fixes to get right.

## Fake server

`vi.mock("@/lib/api")` replaces `api.board.$put` / `$get`, `api.tags.*` and `api["link-preview"].$post` with a small in-memory server (the API is the only out-of-process dependency Board has; everything else runs for real):
- `tagPuts` records each accepted PUT's tags as names (`(string | null)[]`, same order as `puts`; an id not in `registered` shows as `"(登録に無い)"`), so tag changes can be asserted without changing what `puts` holds.
- `registered` is the server's list of registered tags (`{ id, name, icon }[]`, ids numbered `tag-<n>` so a deleted and re-created name gets a new id). Set it up with `register(...names)` before `mount` (or later, for "registered on another device"); `idOf(name)` gives a tag's id for section fixtures (`{ content, tagId: idOf("買い物") }`), `registeredNames()` the names in order, `nameOf(id)` / `serverTags()` the names of the server's sections' tags. `renameOnServer(id, name)` / `unregisterOnServer(id)` change the server like another device would; `$patch` / `$delete` (this screen) use the same functions. Like the real route, renaming changes only the tag (sections point at the id) and deleting untags the server's sections; neither changes the revision. `$patch` to an existing name gets `409 TagExists` and of a missing id `404 TagNotFound`, `$get` on the board also returns `registered` as `tags`, and a PUT stores `null` for a tag id not in `registered`. `tagReply = "offline"` makes `$post` / `$patch` / `$delete` throw; `tagGate` (a promise) delays `$post`'s reply (the registration commits at once, or only after the gate with `tagCommitsLate = true`, like the real route waiting for the icon); `boardGetGate` / `tagListGate` delay the board `$get` / `api.tags.$get`, whose bodies are the server state at request time.
- The tag-list state machine itself (`useBoardTags`: ordering of overlapping replies, the filter reset, the offline cache of the list) has its own hook test, `src/routes/board/-lib/use-board-tags.test.tsx`, with a smaller fake `/api/tags`; add cases about the list there and keep Board tests for what the user sees.
- `previews` (URL → `{ title, siteName }`) is what `/api/link-preview` answers (`null` for other URLs); `previewRequests` logs the URLs asked; `previewRefused = true` answers `429`.
- `puts` records each accepted PUT as `{ id, content }[]`. Assert on `puts.at(-1)` for the last save, or `puts` equal to `[]` for "nothing was sent".
- `server = { revision, sections }` is the server's board. A PUT whose `revision` differs gets `409 { error: "Stale" }`, like the real route. To simulate another device saving, overwrite `server` in the test.
- `sessionUserId`: a PUT with a different `userId` gets `409 { error: "UserMismatch" }` (account switched in another tab).
- `expiredOnServer`: ids the server treats as expired and returns as `null` (issue #94).
- New ids come back as `new-<put#>-<n>`. Rows are stamped with `CREATED` (the current time): the offline cache drops rows older than 30 days by `createdAt`, so a fixed old date would empty it.
- `putReply`: `"offline"` makes `$put` throw `TypeError("Failed to fetch")` (server unreachable), `500` / `429` return that status (`Internal` / `TooManyRequests`). Reset to `"ok"` in `beforeEach`.
- `onLine` backs `navigator.onLine` (`false` = the device knows it is offline, so nothing is sent). Dispatch `new Event("online")` inside `act` to trigger the resend.
- The `保存できないとき (HAY-54)` block stubs `window.confirm` to record the leave-page prompt, and reads where navigation ended from `router.history.location` (with `WithRouter` there is no Transitioner, so `router.state` lags behind once a blocker is registered).

## Router

Board runs inside a real router: `mount` creates `createTestRouter({ loader })` from `@/lib/router-test` and wraps the tree in `WithRouter`, so `useBlocker` and `router.invalidate()` are the real ones. `loads` counts how often the current page's data was reloaded (e.g. `expect(loads).toBe(1)` after the account was switched in another tab).

## Helpers

| Helper | What it does |
|---|---|
| `mount(sections, userId?)` | Creates the root and the router (resets `loads`), fills defaults (`id-<i>`, far-future `expiresAt`), sets `server` to revision `r0`, renders inside `WithRouter` + `HeaderSlotProvider` / `HeaderSlotTarget` |
| `render()` | Re-renders with the same initial sections; Board is not recreated |
| `undoButton()` / `filterLabels()` | The 「元に戻す」 button of the delete notice (portalled to `body`), and the filter bar's button texts in order |
| `addSection()` | Clicks the header's `セクションを追加` button |
| `editor()` / `type(text)` / `key(k)` | Gets the focused CodeMirror view, inserts at the cursor with `userEvent: "input.type"`, or dispatches a keydown on `contentDOM` |
| `sectionTexts()` | Each section's text: the editor doc if editing, otherwise the rendered Markdown's text |
| `waitForSave()` | Waits 1100 ms with real timers (autosave fires 1000 ms after input stops) |

`beforeEach` resets the tag filter, `puts` / `tagPuts`, `registered`, `tagReply` / `tagGate`, the preview knobs and cache, `sessionUserId`, `expiredOnServer`, `putReply`, `onLine`, clears `localStorage`, and writes the cached user `u` (the offline cache is only written for the signed-in user).

## Limits

jsdom has no layout. Rects are empty, and `scrollBy` / `scrollTo` / `scrollIntoView` are no-ops. Anything about scroll placement, visual lines, or what is on screen cannot be asserted here. Test the underlying pure function if there is one, and check the rest in the running app.
