---
name: route-colocation
description: Where to put components, hooks, logic, and tests in poi's frontend (src/) — colocation along TanStack Router routes. Use when creating, moving, or deleting files under src/; when adding or splitting routes or pages; when a piece is about to be used from another page or from the header; or when unsure where something belongs (which route's -components / -lib, or src/components / src/lib). Read it for any task that adds a new .tsx / .ts under src/, even if placement is not mentioned.
---

# Colocation along routes

Put each piece (component, hook, logic) in **the directory of the route that uses it**.
Only things used across route directories go in `src/components` / `src/lib`.

This way, where a file lives tells you which pages use it, and deleting a page means deleting its directory.
`src/components` / `src/lib` hold only what is genuinely shared, so changing something there is a signal to think about its reach.

Treat `__root` as a route too; its pieces go in `routes/(root)/` (an otherwise empty route group, so it has the same shape as every other route).

Placement can be checked mechanically with `scripts/check-placement.mjs` (run from the repository root):

```sh
node .claude/skills/route-colocation/scripts/check-placement.mjs          # check everything
node .claude/skills/route-colocation/scripts/check-placement.mjs <file>   # show that file's users and where it belongs
```

## Deciding where something goes

Placement is decided by where the files that **actually use (import) it** live.
For an existing piece, pass it to the script above as `<file>` to see its users and where it belongs. For a new piece, match where you intend to use it against the table below.

| Used from | Put it in |
|---|---|
| `__root` only (layout, header) | `routes/(root)/-components/` (UI) / `routes/(root)/-lib/` (hooks, logic) |
| One route directory only (including routes nested under it) | That directory's `-components/` / `-lib/`. If shared between nested child routes, the parent directory's `-components/` / `-lib/` |
| Several route directories, or `main.tsx` and a route | `src/components/` (UI) / `src/lib/` (hooks, logic) |
| `main.tsx` only | Directly under `src/` (next to `main.tsx`) |
| A file in `src/lib` (whether or not routes use it too) | `src/lib/` (`src/lib` cannot import from inside routes) |

- Tests sit next to the file under test as `<name>.test.ts(x)` (move the test along with its target)
- CSS Modules sit in the same folder as the component that uses them and are imported as `./X.module.css`
- Inside `-components/` / `-lib/`, you may nest further folders that mirror how the users are structured.
  Nested folder names need no `-` (the parent `-components/` already excludes everything under it from route generation). Once `-lib/` grows, group its files into folders by topic
- Never put a `.tsx` / `.ts` piece directly in a route directory. Any file not starting with `-` is generated as a route and adds a URL
- Things used by both src and worker (constants, validation limits, etc.) go in `shared/` at the repository root and are imported via `@shared/`

When adding or splitting routes or pages, also read [references/routes.md](references/routes.md) (when to use a route group vs. `<name>/index.tsx`).

### When the users change, move the file

- If something belonging to one route starts being used by another route, move it to `src/components` / `src/lib`
- Conversely, if something in `src/components` / `src/lib` ends up used by only one route, move it back into that route's `-components/` / `-lib/`
- Revisit the name when moving. A name tied to the original route (e.g. `XxxFooter` with the page name in it) reads wrong to the other users once it is shared
- Do not get by with importing another route's `-components/` / `-lib/` directly. The same goes for importing route internals from `src/components` / `src/lib`.
  Both are `npm run lint` errors (the former via `biome-plugins/route-colocation.grit`, the latter via `noRestrictedImports` in `biome.json`).
  When lint fails, fix the placement instead of rewriting the import to slip past the rule

### Before moving a whole file, see whether only part of it needs extracting

When only part of one route's code is needed by another route, moving the whole thing to `src/lib` drags that route's types and concerns into shared code.
Extract just the part that really needs sharing into `src/lib` and leave the rest in the route.

Example: the header's logout needs to clear a route's cache. If clearing only needs the cache key,
put the key and the clear function in `src/lib`, and keep the reads and writes that depend on the route's types in the route's `-lib/`.

### Things shown in the header

When a button or indicator that depends on page state should appear in the header, do not make it a header (`__root`) piece. Build it on the page side and insert it with `<HeaderSlot>`.
See [references/header-slot.md](references/header-slot.md).

## Import style

- Within the same route directory, use relative paths (`./`, `../`). From `__root.tsx`, `(root)/` is also `./(root)/...`
- Refer to `src/components` / `src/lib` via `@/` (`@/lib/...`, `@/components/...`)

## After moving or adding files

1. Run `node .claude/skills/route-colocation/scripts/check-placement.mjs`. It finds:
   - Placements that don't match their users, and pieces no longer used anywhere
   - Pieces placed directly in a route directory
   - `import` / `import()` / `vi.mock` paths that don't resolve (`vi.mock` on a nonexistent path is not an error, so the test passes without mocking anything)
   - File paths written in comments that no longer exist (it looks in src / worker / shared / config files)
2. If you renamed something, search for leftovers of the old name in comments etc. with `grep -rn "<old name>" src worker shared` (the script only checks paths)
3. Make `npm run typecheck && npm run lint && npm test && npm run build` pass
4. `src/routeTree.gen.ts` is generated; never edit it by hand. If it changed, commit it as is
