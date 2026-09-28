# Adding or splitting routes (TanStack Router naming)

- `(name)/` is a route group and does not affect the URL. Use one in these two cases:
  - To give pieces a home for a route whose URL can't come from a directory name, such as `/` (`(xxx)/index.tsx` + `(xxx)/-components/`)
  - To share pieces between pages whose URLs have no common prefix (`(xxx)/a.tsx` and `(xxx)/b.tsx` share `(xxx)/-components/`)
- A standalone page with its own pieces becomes `<name>/index.tsx` + `<name>/-components/`. Without pieces, `<name>.tsx` is fine
  (switching from `<name>.tsx` to `<name>/index.tsx` as pieces are added does not change the URL)
- Nested URLs are made with directories (`posts/$postId/index.tsx`). When everything under a directory needs a shared layout, put a `route.tsx` in that directory
- Route IDs include the group name (`"/(xxx)/"`). The generator rewrites the `createFileRoute` argument automatically, so there is no need to match it by hand
- `src/routeTree.gen.ts` is generated; never edit it by hand. If it changed, commit it as is

## Keeping the first paint light (code splitting)

`tanstackRouter({ autoCodeSplitting: true })` puts each route's `component` in its own chunk, but everything that component imports statically goes into that chunk too, and the chunk is only fetched after `beforeLoad` finishes (in parallel with `loader`). So (issue #110):
- A route that renders one of several pages (the top page: `BoardView` when signed in, `Landing` otherwise) loads each page with `lazyRouteComponent(() => import("./-components/X"), "X")` instead of a static import, so signed-out visitors don't download the board's CodeMirror / react-markdown chunk.
- Start those chunks from the `loader` (`X.preload?.()`; `preload` is removed once loaded, hence `?.`) and await them there together with the data, so the page never suspends on first render. `loadTopPageWithView` (`(board)/-lib/data/board-loader.ts`) also guesses the page from the cached user and starts that chunk before the session check returns.
- Don't await network work in `beforeLoad` (such as the session check); do it in the `loader`, otherwise it delays the route's chunk. `beforeLoad` is for redirects / guards that must run before anything loads.
- Every chunk is precached by the PWA (`globPatterns` in `vite.config.ts`), so lazy pages still work offline; keep them same-origin files (the CSP allows only `script-src 'self'`).
- Check the effect with `npm run build` (chunk sizes) and in the production preview (`verifying-in-app`, "Production build") which chunks each page downloads.

