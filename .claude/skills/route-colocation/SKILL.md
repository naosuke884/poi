---
name: route-colocation
description: poi のフロントエンド (src/) で、コンポーネント・フック・ロジック・テストをどこに置くかの規則 (TanStack Router のルートに沿ったコロケーション)。src/ にファイルを作る・移す・消すとき、ルートやページを追加・分割するとき、ある部品を別のページやヘッダーからも使いたくなったとき、置き場所 (どのルートの -components / -lib か、src/components・src/lib か) に迷ったときに使う。「置き場所」と言われていなくても、src/ に新しい .tsx / .ts を足す作業なら読む。
---

# ルートに沿ったコロケーション

部品 (コンポーネント・フック・ロジック) は、**それを使うルートのディレクトリ**に置く。
ルートのディレクトリをまたいで使うものだけを `src/components` / `src/lib` に置く。

こうしておくと、置き場所を見るだけで「どのページが使っているか」が分かり、ページを消すときはディレクトリごと消せる。
`src/components` / `src/lib` は「本当に共有されているもの」だけになるので、そこを変えるときに影響範囲を意識できる。

`__root` もルートの 1 つとして扱い、その部品は `routes/(root)/` に置く (中身のないルートグループで、ほかのルートと同じ形にするため)。

置き場所の検査は `scripts/check-placement.mjs` で機械的にできる (リポジトリ直下から実行する)。

```sh
node .claude/skills/route-colocation/scripts/check-placement.mjs          # 全体を検査
node .claude/skills/route-colocation/scripts/check-placement.mjs <file>   # そのファイルの使う側と、置くべき場所
```

## 置き場所の決め方

置き場所は、その部品を**実際に使う (import する) ファイル**がどこにあるかで決まる。
既存の部品なら上のスクリプトに `<file>` を渡すと、使う側と置くべき場所が出る。新しく作る部品なら、どこから使うつもりかで下の表に当てはめる。

| 使う場所 | 置き場所 |
|---|---|
| `__root` (レイアウト・ヘッダー) だけ | `routes/(root)/-components/` (UI) / `routes/(root)/-lib/` (フック・ロジック) |
| 1 つのルートのディレクトリだけ (その下にネストしたルートも含む) | そのディレクトリの `-components/` / `-lib/`。ネストした子ルートどうしで共有するなら、親ディレクトリの `-components/` / `-lib/` |
| 複数のルートのディレクトリ | `src/components/` (UI) / `src/lib/` (フック・ロジック) |
| `main.tsx` だけ | `src/` 直下 (`main.tsx` の隣) |
| `src/lib` のファイルから (ルートからも使うかにかかわらず) | `src/lib/` (`src/lib` からルートの中は import できないため) |

- テストは対象のファイルの隣に `<name>.test.ts(x)` として置く (対象を移したらテストも一緒に移す)
- CSS Modules は使うコンポーネントと同じフォルダに置き、`./X.module.css` で読む
- `-components/` / `-lib/` の中は、使う側の親子関係に合わせてさらにフォルダで入れ子にしてよい。
  入れ子のフォルダ名には `-` は要らない (親の `-components/` ごとルート生成の対象外になるため)。`-lib/` はファイルが増えたら話題ごとのフォルダにまとめる
- `.tsx` / `.ts` の部品をルートのディレクトリ直下に置かない。`-` で始まらないファイルはルートとして生成され、URL が増える
- src と worker の両方で使うもの (定数・検証の上限など) は、リポジトリ直下の `shared/` に置いて `@shared/` で参照する

ルートやページを追加・分割するときは、[references/routes.md](references/routes.md) (ルートグループと `<name>/index.tsx` の使い分け) も読む。

### 使う側が変わったら置き場所も移す

- 1 つのルートのものを別のルートでも使うことになったら、`src/components` / `src/lib` へ移す
- 逆に `src/components` / `src/lib` のものを 1 つのルートでしか使わなくなったら、そのルートの `-components/` / `-lib/` へ戻す
- 移すときは名前も見直す。元のルートに寄った名前 (ページ名の付いた `XxxFooter` など) のまま共有の場所へ出すと、他の使う側から見て意味が合わなくなる
- 別のルートの `-components/` / `-lib/` を直接 import して済ませない。`src/components` / `src/lib` からルートの中を import するのも同じ。
  どちらも `npm run lint` のエラーになる (前者は `biome-plugins/route-colocation.grit`、後者は `biome.json` の `noRestrictedImports`)。
  lint が通らないときに import の書き方を変えてすり抜けるのではなく、置き場所を直す

### 丸ごと移す前に、一部だけ切り出せないか考える

1 つのルートのものの一部だけを別のルートでも使うときは、丸ごと `src/lib` へ移すと、そのルートの型や事情まで共有側に持ち込むことになる。
共有が本当に要る部分だけを切り出して `src/lib` に置き、残りはルートに残す。

例: あるルートのキャッシュを、ヘッダーのログアウトからも消したい。消すのに要るのがキャッシュのキーだけなら、
キーと消去の関数だけを `src/lib` に置き、そのルートの型に依存する読み書きはルートの `-lib/` に残す。

### ヘッダーに出すもの

ページの状態に依存するボタンや表示をヘッダーに出したいときは、ヘッダー (`__root`) の部品にせず、ページ側で作って `<HeaderSlot>` で差し込む。
詳しくは [references/header-slot.md](references/header-slot.md)。

## import の書き方

- 同じルートのディレクトリの中は相対パス (`./`, `../`)。`__root.tsx` から `(root)/` も `./(root)/...`
- `src/components` / `src/lib` は `@/` で参照する (`@/lib/...`, `@/components/...`)

## ファイルを移動・追加したあと

1. `node .claude/skills/route-colocation/scripts/check-placement.mjs` を実行する。次のものが見つかる
   - 使う側と合っていない置き場所、どこからも使われなくなった部品
   - ルートのディレクトリ直下に置かれた部品
   - 解決できない import / `import()` / `vi.mock` のパス (`vi.mock` は存在しないパスでもエラーにならず、テストが何もモックせずに通ってしまう)
   - コメントに書かれた、存在しないファイルパス (src / worker / shared / 設定ファイルを見る)
2. 名前を変えたなら、古い名前がコメントなどに残っていないか `grep -rn "<古い名前>" src worker shared` で探す (スクリプトはパスしか見ない)
3. `npm run typecheck && npm run lint && npm test && npm run build` を通す
4. `src/routeTree.gen.ts` は自動生成なので手で編集しない。変更されていればそのままコミットする
