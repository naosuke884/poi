---
name: route-colocation
description: poi のフロントエンド (src/) で、コンポーネント・フック・ロジックをどこに置くかの規則 (TanStack Router のルートに沿ったコロケーション)。新しいコンポーネントやフックを作るとき、ルートを追加・分割するとき、ファイルを移動するとき、置き場所 (どのルートの -components / -lib か、src/components・src/lib か) に迷ったときに使う。
---

# ルートに沿ったコロケーション

部品 (コンポーネント・フック・ロジック) は、**それを使うルートのディレクトリ**に置く。
ルートのディレクトリをまたいで使うものだけを `src/components` / `src/lib` に置く。
`__root` もルートの 1 つとして扱い、その部品は `routes/(root)/` に置く (中身のないルートグループで、`(board)` などと同じ形にするため)。

## 置き場所の決め方

| 使う場所 | 置き場所 |
|---|---|
| `__root` (レイアウト・ヘッダー) だけ | `routes/(root)/-components/` (UI) / `routes/(root)/-lib/` (フック・ロジック・テスト) |
| 1 つのルートのディレクトリだけ (その下にネストしたルートも含む) | そのディレクトリの `-components/` / `-lib/`。ネストした子ルートどうしで共有するなら、親ディレクトリの `-components/` / `-lib/` |
| 複数のルートのディレクトリ (`__root` のヘッダーと `(board)` など) | `src/components/` (UI) / `src/lib/` (フック・ロジック・テスト) |
| `main.tsx` だけ | `src/` 直下 (`main.tsx` の隣) |

- 使う側が増えたり減ったりしたら、そのつど置き場所を移す。
  例: `(board)/-lib/x.ts` を `__root` のヘッダーでも使うことになったら `src/lib/x.ts` へ移す。
  逆に `src/lib` のものを 1 つのルートでしか使わなくなったら、そのルートの `-lib/` へ戻す
- 別のルートのディレクトリの `-components/` / `-lib/` を直接 import しない (必要になった時点で `src/components` / `src/lib` へ移す)。
  `src/components` / `src/lib` から `src/routes` の中も import しない。
  前者は Biome の GritQL プラグイン (`biome-plugins/route-colocation.grit`)、後者は `noRestrictedImports` (`biome.json`) で `npm run lint` のエラーになる
- `src/lib` の中で完結するもの (`src/lib` のファイルからしか使わないもの) も `src/lib` に置く
- `-components/` / `-lib/` の中はさらにフォルダで入れ子にしてよい (`board/section/` のように、使う側の親子関係に合わせる)。
  入れ子のフォルダ名には `-` は要らない (親の `-components/` ごとルート生成の対象外になるため)。
  `-lib/` はファイルが増えたら話題ごとにまとめる (`(board)/-lib/markdown/`, `editor/`, `sections/` など)

## ヘッダーにページの操作を出す (HeaderSlot)

ヘッダーは `__root` の部品だが、ページ専用のボタンや状態表示をヘッダーの部品として作らない
(作るとページの状態が「複数のルートで使うもの」になり、`src/lib` に押し出される)。
ページ側で作り、`@/components/HeaderSlot` の `<HeaderSlot>` で包んで描画すると、ヘッダーの差し込み位置に portal で出る。
状態はページの中で props として渡せばよい (例: `(board)/-components/board/Board.tsx` が `board/header/` の
`ViewToggle` / `AddSectionButton` / `SaveStatusIcon` を出している)

## 現在の構成

```
src/
  main.tsx                ルーターの作成と描画
  RouteErrorFallback.tsx  main.tsx だけで使う
  components/             複数のルートで使う UI (HeaderSlot, BottomLeftNotice, ContactLink)
  lib/                    複数のルートで使うもの (板の型, API, 認証, キャッシュ, オフライン判定など)
  routes/
    __root.tsx            全ページ共通のレイアウト (ヘッダー・本文の枠)
    (root)/               __root 専用 (ルートのないグループ)
      -components/        header/, SkipLink, NotFound, バナー
      -lib/               use-online, use-account-actions
    (board)/
      index.tsx           → "/"
      -components/        board/ (header/, section/), landing/, BoardView
      -lib/               board-loader など + markdown/ (記法の判定), editor/ (エディタの編集操作),
                          sections/ (セクションの状態・保存・操作)
    (legal)/
      privacy.tsx         → "/privacy"
      terms.tsx           → "/terms"
      -components/        LegalPage
    login.tsx             → "/login" (/ への転送のみ)
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

- 同じルートのディレクトリの中は相対パス (`./`, `../`)。`__root.tsx` から `(root)/` も `./(root)/...`
- `src/components` / `src/lib` は `@/` で参照する (`@/lib/board`, `@/components/HeaderSlot`)
- CSS Modules は使うコンポーネントと同じフォルダに置き、`./X.module.css` で読む

## ファイルを移動・追加したあと

1. `vi.mock("...")` と `await import("...")` のパスも忘れずに直す (テストが古いパスをモックしたまま通ることがある)
2. コメントに書かれたファイルパス (`src/lib/...` など) も直す。`vite.config.ts` や `worker/` からも参照されている
3. `npm run typecheck && npm run lint && npm test && npm run build` を通す
4. `src/routeTree.gen.ts` は自動生成なので手で編集しない。変更されていればそのままコミットする。
   生成されたルートに `-components` などが紛れ込んでいないか (= URL が増えていないか) を確認する
