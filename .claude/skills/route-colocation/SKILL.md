---
name: route-colocation
description: poi のフロントエンド (src/) で、コンポーネント・フック・ロジックをどこに置くかの規則 (TanStack Router のルートに沿ったコロケーション)。新しいコンポーネントやフックを作るとき、ルートを追加・分割するとき、ファイルを移動するとき、置き場所 (どのルートの -components / -lib か) に迷ったときに使う。
---

# ルートに沿ったコロケーション

部品 (コンポーネント・フック・ロジック) は、**それを使うファイルすべての最も近い共通の祖先**に置く。
祖先の単位はルート (`__root` → `(board)` / `(legal)` / … → さらに下のルート) で、その上に `main.tsx` がある。

## 置き場所の決め方

| 使う場所 | 置き場所 |
|---|---|
| 1 つのルートだけ | そのルートの `-components/` (UI) / `-lib/` (フック・ロジック・テスト) |
| 同じ親ルートの下の複数のルート | その親ルートの `-components/` / `-lib/` |
| 兄弟関係にあるトップレベルのルート同士 (`__root` のヘッダーと `(board)` など) | `routes/-components/` / `routes/-lib/` (`__root` の階層) |
| `main.tsx` (ルートの外) | `src/` 直下 (`main.tsx` の隣。フォルダは作らない) |

- 使う側が増えたり減ったりしたら、そのつど共通の祖先へ上げる / 下げる。
  例: `(board)/-lib/x.ts` を `__root` のヘッダーでも使うことになったら `routes/-lib/x.ts` へ移す
- 兄弟のルートの `-components/` / `-lib/` を直接 import しない (必要になった時点で共通の祖先へ上げる)
- `-components/` / `-lib/` の中はさらにフォルダで入れ子にしてよい (`board/section/` のように、使う側の親子関係に合わせる)。
  入れ子のフォルダ名には `-` は要らない (親の `-components/` ごとルート生成の対象外になるため)

## 現在の構成

```
src/
  main.tsx            ルーターの作成と描画
  RouteErrorFallback.tsx, install-prompt.ts, local-storage.ts, offline.ts
                      main.tsx の階層 (main.tsx から使うもの)
  routes/
    __root.tsx        全ページ共通のレイアウト (ヘッダー・本文の枠)
    -components/      __root の階層: header/, SkipLink, NotFound, バナー, 複数ルートで使う UI (TablerIcon など)
    -lib/             __root の階層: 板の状態 (board, save-status, view-mode など), API, 認証, キャッシュ
    (board)/
      index.tsx       → "/"
      -components/    board/, landing/, BoardView
      -lib/           板の編集・保存・Markdown 処理など (/ だけで使うもの)
    (legal)/
      privacy.tsx     → "/privacy"
      terms.tsx       → "/terms"
      -components/    LegalPage
    login.tsx         → "/login" (/ への転送のみ)
```

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

- 同じルートの中 (そのルートのファイルと、その `-components/` / `-lib/`) は相対パス (`./`, `../`)。`src/` 直下どうしも `./`
- 祖先の階層のものは `@/` で参照する (`@/routes/-lib/board`, `@/offline`)。深い `../../../../` を書かない
- CSS Modules は使うコンポーネントと同じフォルダに置き、`./X.module.css` で読む

## ファイルを移動・追加したあと

1. `vi.mock("...")` と `await import("...")` のパスも忘れずに直す (テストが古いパスをモックしたまま通ることがある)
2. コメントに書かれたファイルパス (`src/routes/-lib/...` など) も直す。`vite.config.ts` や `worker/` からも参照されている
3. `npm run typecheck && npm run lint && npm test && npm run build` を通す
4. `src/routeTree.gen.ts` は自動生成なので手で編集しない。変更されていればそのままコミットする。
   生成されたルートに `-components` などが紛れ込んでいないか (= URL が増えていないか) を確認する
