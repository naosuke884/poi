# ルートを追加・分割するとき (TanStack Router の命名規則)

- `(name)/` はルートグループ。URL に影響しない。次の 2 つの場合に使う
  - `/` のように、ディレクトリ名で URL を作れないルートに部品を置くとき (`(xxx)/index.tsx` + `(xxx)/-components/`)
  - URL に共通の接頭辞がない複数のページで部品を共有するとき (`(xxx)/a.tsx` と `(xxx)/b.tsx` が `(xxx)/-components/` を共有)
- 部品を持つ単独のページは `<name>/index.tsx` + `<name>/-components/` にする。部品がなければ `<name>.tsx` のままでよい
  (部品が増えて `<name>.tsx` → `<name>/index.tsx` に変えても URL は変わらない)
- ネストした URL はディレクトリで作る (`posts/$postId/index.tsx`)。配下に共通のレイアウトが要るときはそのディレクトリに `route.tsx` を置く
- ルート ID にはグループ名が入る (`"/(xxx)/"`)。`createFileRoute` の引数は生成処理が自動で書き換えるので手で合わせなくてよい
- `src/routeTree.gen.ts` は自動生成なので手で編集しない。変更されていればそのままコミットする
