---
name: route-colocation
description: poi のフロントエンド (src/) で、コンポーネント・フック・ロジック・テストをどこに置くかの規則 (TanStack Router のルートに沿ったコロケーション)。src/ にファイルを作る・移す・消すとき、ルートやページを追加・分割するとき、ある部品を別のページやヘッダーからも使いたくなったとき、置き場所 (どのルートの -components / -lib か、src/components・src/lib か) に迷ったときに使う。「置き場所」と言われていなくても、src/ に新しい .tsx / .ts を足す作業なら読む。
---

# ルートに沿ったコロケーション

部品 (コンポーネント・フック・ロジック) は、**それを使うルートのディレクトリ**に置く。
ルートのディレクトリをまたいで使うものだけを `src/components` / `src/lib` に置く。

こうしておくと、置き場所を見るだけで「どのページが使っているか」が分かり、ページを消すときはディレクトリごと消せる。
`src/components` / `src/lib` は「本当に共有されているもの」だけになるので、そこを変えるときに影響範囲を意識できる。

`__root` もルートの 1 つとして扱い、その部品は `routes/(root)/` に置く (中身のないルートグループで、`(board)` などと同じ形にするため)。

## 置き場所の決め方

1. まず、その部品を**実際に使う (import する) ファイル**を洗い出す。既存の部品なら `grep -rn "<ファイル名>" src` で確かめる
2. 使う側がどのルートのディレクトリに入っているかで、下の表から置き場所を決める
3. 既存の部品の使う側が変わる作業なら、表に照らして移動が要るかを確かめる

| 使う場所 | 置き場所 |
|---|---|
| `__root` (レイアウト・ヘッダー) だけ | `routes/(root)/-components/` (UI) / `routes/(root)/-lib/` (フック・ロジック) |
| 1 つのルートのディレクトリだけ (その下にネストしたルートも含む) | そのディレクトリの `-components/` / `-lib/`。ネストした子ルートどうしで共有するなら、親ディレクトリの `-components/` / `-lib/` |
| 複数のルートのディレクトリ (`__root` のヘッダーと `(board)` など) | `src/components/` (UI) / `src/lib/` (フック・ロジック) |
| `main.tsx` だけ | `src/` 直下 (`main.tsx` の隣) |
| `src/lib` のファイルからだけ | `src/lib/` |

テストは対象のファイルの隣に `<name>.test.ts(x)` として置く (対象を移したらテストも一緒に移す)。

### 使う側が変わったら置き場所も移す

- 1 つのルートのものを別のルートでも使うことになったら、`src/components` / `src/lib` へ移す。
  例: `(board)/-lib/x.ts` を `__root` のヘッダーでも使うなら `src/lib/x.ts` へ
- 逆に `src/lib` のものを 1 つのルートでしか使わなくなったら、そのルートの `-lib/` へ戻す
- 移すときは名前も見直す。元のルートに寄った名前 (`LandingFooter` など) のまま共有の場所へ出すと、他の使う側から見て意味が合わなくなる
- 別のルートの `-components/` / `-lib/` を直接 import して済ませない。`src/components` / `src/lib` からルートの中を import するのも同じ。
  どちらも `npm run lint` のエラーになる (前者は `biome-plugins/route-colocation.grit`、後者は `biome.json` の `noRestrictedImports`)。
  lint が通らないときに import の書き方を変えてすり抜けるのではなく、置き場所を直す

### 丸ごと移す前に、一部だけ切り出せないか考える

1 つのルートのものの一部だけを別のルートでも使うときは、丸ごと `src/lib` へ移すと、そのルートの型や事情まで共有側に持ち込むことになる。
共有が本当に要る部分だけを切り出して `src/lib` に置き、残りはルートに残す。

例: 板のキャッシュはヘッダーのログアウトからも消すが、消すのに要るのはキーだけなので、キーと消去 (`src/lib/offline-caches.ts`) だけを
`src/lib` に置き、板の型に依存する読み書き (`(board)/-lib/data/board-cache.ts`) と板の型 (`data/board.ts`) は `(board)` に残している。

## ヘッダーにページの操作を出す (HeaderSlot)

ヘッダーは `__root` の部品だが、ページ専用のボタンや状態表示をヘッダーの部品として作らない。
作るとページの状態を `__root` から触ることになり、「複数のルートで使うもの」として `src/lib` に押し出されてしまう。

代わりにページ側で作り、`@/components/HeaderSlot` の `<HeaderSlot>` で包んで描画する。ヘッダーの差し込み位置に portal で出るので、
状態はページの中で普通に props として渡せる (例: `(board)/-components/board/Board.tsx` が `board/header/` の
`ViewToggle` / `AddSectionButton` / `SaveStatusIcon` を出している)。
「ヘッダーに〇〇を出したい」と言われたら、まずそれがページの状態に依存するかを考え、依存するならこの形にする。

## ディレクトリの形

```
src/
  main.tsx, RouteErrorFallback.tsx   ルーターの作成と描画 (と main.tsx だけで使うもの)
  components/                        複数のルートで使う UI
  lib/                               複数のルートで使うもの (API, 認証, オフライン判定, キャッシュのキーと消去など)
  routes/
    __root.tsx                       全ページ共通のレイアウト
    (root)/-components, -lib         __root 専用 (ヘッダー, バナー, NotFound など)
    (board)/index.tsx                → "/"  板の画面とランディング
    (board)/-components, -lib        -lib は話題ごとのフォルダ: data/ (型, キャッシュ, loader), markdown/, editor/, sections/
    (legal)/privacy.tsx, terms.tsx   → "/privacy", "/terms"  (-components に共通の LegalPage)
    login.tsx                        → "/login"
```

今あるファイルは `find src -type f -not -name '*.test.*' | sort` で確かめる (ここには書き写さない。移動のたびに古くなるため)。

- `-components/` / `-lib/` の中はさらにフォルダで入れ子にしてよい (`board/section/` のように、使う側の親子関係に合わせる)。
  入れ子のフォルダ名には `-` は要らない (親の `-components/` ごとルート生成の対象外になるため)
- `-lib/` はファイルが増えたら話題ごとのフォルダにまとめる

## TanStack Router の命名規則 (ここで使うもの)

- `-` で始まるファイル・フォルダはルートとして扱われない。`.tsx` / `.ts` の部品は必ず `-components/` / `-lib/` の中に置く
  (ルートのディレクトリ直下に置くと、ルートとして生成されて URL が増える。`.css` などは無視されるが、置き場所の規則は同じ)
- `(name)/` はルートグループ。URL に影響しない。次の 2 つの場合に使う
  - `/` のように、ディレクトリ名で URL を作れないルートに部品を置くとき (`(board)/index.tsx`)
  - URL に共通の接頭辞がない複数のページで部品を共有するとき (`(legal)/privacy.tsx` と `(legal)/terms.tsx`)
- 部品を持つ単独のページは `<name>/index.tsx` + `<name>/-components/` にする。部品がなければ `<name>.tsx` のままでよい
  (部品が増えて `<name>.tsx` → `<name>/index.tsx` に変えても URL は変わらない)
- ネストした URL はディレクトリで作る (`posts/$postId/index.tsx`)。配下に共通のレイアウトが要るときはそのディレクトリに `route.tsx` を置く
- ルート ID にはグループ名が入る (`"/(board)/"`, `"/(legal)/terms"`)。`createFileRoute` の引数は生成処理が自動で書き換えるので手で合わせなくてよい

## import の書き方

- 同じルートのディレクトリの中は相対パス (`./`, `../`)。`__root.tsx` から `(root)/` も `./(root)/...`
- `src/components` / `src/lib` は `@/` で参照する (`@/lib/api`, `@/components/HeaderSlot`)
- src と worker の両方で使うもの (定数・検証の上限など) はリポジトリ直下の `shared/` に置き、`@shared/` で参照する (`@shared/constants`)。
  `shared/` からは `src` / `worker` を import しない (ブラウザと Workers の両方で動く必要があるため。lint エラーになる)
- CSS Modules は使うコンポーネントと同じフォルダに置き、`./X.module.css` で読む

## ファイルを移動・追加したあと

1. `vi.mock("...")` と `await import("...")` のパスも直す。
   `vi.mock` は存在しないパスでもエラーにならず、テストが古いパスをモックしたまま (= 何もモックせずに) 通ることがある
2. コメントに書かれたファイルパス (`src/lib/...` など) も `grep -rn "<古いパス>" .` で探して直す。`vite.config.ts` や `worker/` からも参照されている
3. `npm run typecheck && npm run lint && npm test && npm run build` を通す
4. `src/routeTree.gen.ts` は自動生成なので手で編集しない。変更されていればそのままコミットする。
   生成されたルートに `-components` などが紛れ込んでいないか (= URL が増えていないか) を確認する
