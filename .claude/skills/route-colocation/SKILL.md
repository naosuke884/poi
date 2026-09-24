---
name: route-colocation
description: poi のフロントエンド (src/) で、コンポーネント・フック・ロジックをどこに置くかの規則 (TanStack Router のルートごとのコロケーション)。新しいコンポーネントやフックを作るとき、ルートを追加・分割するとき、ファイルを移動するとき、src/components や src/lib に置くか src/routes 配下に置くか迷ったときに使う。
---

# ルートごとのコロケーション

部品 (コンポーネント・フック・ロジック) は、**それを使うルートのディレクトリ**に置く。
複数のルートで使うものだけを `src/components` / `src/lib` に置く。

## 置き場所の決め方

| 使う場所 | 置き場所 |
|---|---|
| 1 つのルートだけ (レイアウトの `__root` も 1 つのルートとして数える) | そのルートの `-components/` (UI) / `-lib/` (フック・ロジック・テスト) |
| 2 つ以上のルート、または `main.tsx` などルートの外 | `src/components/` (UI) / `src/lib/` (フック・ロジック) |

- 別のルートの `-components/` / `-lib/` を import しない。2 つ目のルートで必要になったら、その時点で `src/components` / `src/lib` へ移す
- 逆に、共有に置いたものの利用元が 1 ルートだけになったら、そのルートへ戻す
- `-components/` の中はさらにフォルダで入れ子にしてよい (`board/section/` のように、使う側の親子関係に合わせる)。入れ子のフォルダ名には `-` は要らない (親の `-components/` ごとルート生成の対象外になるため)

## 現在の構成

```
src/routes/
  __root.tsx          全ページ共通のレイアウト (ヘッダー・本文の枠)
  -components/        __root 専用 (header/, SkipLink, NotFound, バナー)
  -lib/               __root 専用 (use-online, use-account-actions)
  (board)/
    index.tsx         → "/"
    -components/      board/, landing/, BoardView
    -lib/             板の編集・保存・Markdown 処理など
  (legal)/
    privacy.tsx       → "/privacy"
    terms.tsx         → "/terms"
    -components/      LegalPage
  login.tsx           → "/login" (/ への転送のみ)
src/components/       複数ルートで共有する UI
src/lib/              複数ルートで共有する状態・API・キャッシュなど
```

`routes/` 直下の `-components/` / `-lib/` は **`__root` 専用**であり、「全体で共有する部品置き場」ではない。
共有するものは `src/components` / `src/lib` に置く。

## TanStack Router の命名規則 (ここで使うもの)

- `-` で始まるファイル・フォルダはルートとして扱われない。`.tsx` / `.ts` の部品は必ず `-components/` / `-lib/` の中に置く
  (`.css` などは `-` がなくても無視されるが、置き場所の規則は同じ)
- `(name)/` はルートグループ。URL に影響しない。次の 2 つの場合に使う
  - `/` のように、ディレクトリ名で URL を作れないルートに部品を置くとき (`(board)/index.tsx`)
  - URL に共通の接頭辞がない複数のページで部品を共有するとき (`(legal)/privacy.tsx` と `(legal)/terms.tsx`)
- 部品を持つ単独のページは `<name>/index.tsx` + `<name>/-components/` にする。部品がなければ `<name>.tsx` のままでよい
- ネストした URL はディレクトリで作る (`posts/$postId/index.tsx`)。配下に共通のレイアウトが要るときはそのディレクトリに `route.tsx` を置く
- ルート ID にはグループ名が入る (`"/(board)/"`, `"/(legal)/terms"`)。`createFileRoute` の引数は生成処理が自動で書き換えるので手で合わせなくてよい

## import の書き方

- 同じルートの中 (`__root` なら `routes/-components` と `routes/-lib`) は相対パス (`./`, `../`)
- `src/components` / `src/lib` は `@/` で参照する (`@/lib/board`)
- CSS Modules は使うコンポーネントと同じフォルダに置き、`./X.module.css` で読む

## ファイルを移動・追加したあと

1. `vi.mock("...")` と `await import("...")` のパスも忘れずに直す (テストが古いパスをモックしたまま通ることがある)
2. コメントに書かれたファイルパス (`src/lib/...` など) も直す。`vite.config.ts` や `worker/` からも参照されている
3. `npm run typecheck && npm run lint && npm test && npm run build` を通す
4. `src/routeTree.gen.ts` は自動生成なので手で編集しない。変更されていればそのままコミットする。
   生成されたルートに `-components` などが紛れ込んでいないか (= URL が増えていないか) を確認する
