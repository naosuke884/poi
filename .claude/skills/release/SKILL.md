---
name: release
description: poi のリリースを切る。リリース前の留意事項チェック → version bump → 注釈付きタグを push すると GitHub Release が自動作成される。
---

# poi のリリース手順

リリース = package.json のバージョンを bump して `vX.Y.Z` の注釈付きタグを push すること。
タグ push で `.github/workflows/release.yml` が GitHub Release を作る (本文 = タグ注釈のメッセージ本文)。
CHANGELOG ファイルは持たない。デプロイはリリースと無関係に main への push ごとに走る (deploy.yml)。

## 1. リリース前チェック (留意事項)

- `main` ブランチで作業ツリーが clean、`git pull` 済みであること。
- 前回タグ以降のコミットを確認する: `git log "$(git describe --tags --abbrev=0)..HEAD" --oneline`
  - リリースすべき変更がなければここで止める。
- **README の更新**: ユーザーに見える機能・挙動の変更が README に反映されていなければ、
  リリース前に **README.md と README.ja.md の両方** を更新してコミットする (必ず両方セットで)。
- セルフホスト手順に影響する変更 (環境変数、wrangler.jsonc、OAuth 設定、Node バージョンなど) も
  README の該当セクションを更新する。
- DB スキーマ変更が含まれる場合、migration が `drizzle/` にコミット済みであること (deploy が自動適用)。
- 収集データ・保持期間など規約に関わる変更があれば、/terms・/privacy のページを先に更新する。
- 直近の main の CI が green であること: `gh run list --branch main --limit 3`

## 2. バージョンを決める

- 既定は patch。ユーザーに見える新機能が入っていれば minor。major はアプリなので基本使わない。

## 3. リリースノートを書く

- 前回タグ以降のコミット見出しをもとに、ユーザー視点の箇条書きを**英語**で書く
  (GitHub Release は公開ページ)。内部リファクタ等はまとめるか省いてよい。箇条書きだけで十分。
- 一時ファイル (リポジトリ外、例: `mktemp`) に次の形式で書く:

  ```
  Release vX.Y.Z

  - <ユーザー視点の変更点>
  - ...
  ```

## 4. bump / タグ / push

```sh
npm version <patch|minor|X.Y.Z> --no-git-tag-version
git commit -am "Release vX.Y.Z"
git tag -a "vX.Y.Z" -F "$notes_file"
git push origin main "vX.Y.Z"
```

## 5. 確認

- Release ワークフローの成功を確認: `gh run watch` または `gh run list --limit 3`
- 本文を確認: `gh release view vX.Y.Z`
