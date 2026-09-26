# Adding or splitting routes (TanStack Router naming)

- `(name)/` is a route group and does not affect the URL. Use one in these two cases:
  - To give pieces a home for a route whose URL can't come from a directory name, such as `/` (`(xxx)/index.tsx` + `(xxx)/-components/`)
  - To share pieces between pages whose URLs have no common prefix (`(xxx)/a.tsx` and `(xxx)/b.tsx` share `(xxx)/-components/`)
- A standalone page with its own pieces becomes `<name>/index.tsx` + `<name>/-components/`. Without pieces, `<name>.tsx` is fine
  (switching from `<name>.tsx` to `<name>/index.tsx` as pieces are added does not change the URL)
- Nested URLs are made with directories (`posts/$postId/index.tsx`). When everything under a directory needs a shared layout, put a `route.tsx` in that directory
- Route IDs include the group name (`"/(xxx)/"`). The generator rewrites the `createFileRoute` argument automatically, so there is no need to match it by hand
- `src/routeTree.gen.ts` is generated; never edit it by hand. If it changed, commit it as is
