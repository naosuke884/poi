# poi

[![CI](https://github.com/naosuke884/poi/actions/workflows/ci.yml/badge.svg)](https://github.com/naosuke884/poi/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[English README](./README.md)

**poi** は「しばらくの間だけ必要なもの」のための 1 枚のメモ帳です。[poinote.app](https://poinote.app/) から、Google アカウントでログインして、すぐに始められます。

https://github.com/user-attachments/assets/aa770060-e391-4936-a1c9-59fb785dfbf3

## 特徴

- **セクションごとに30日で強制削除される** — 30日経ったメモ書きは必要性を失っている、また必要に感じたときに書けばいいよ
- **Markdownで構造化できる** — メモ書きといえど見やすく構造化したい人は少なくないだろう
- **セクションごとのコピーとスクショ機能** — メモを共有をワンクリックでできたら便利でしょ？
- **セクションごとの折りたたみ・ワンクリック削除** — 興味がなくなったメモはすぐに視界からけしたり、世界から消したりできるよマスター
- **PWA** — Webアプリをネイティブアプリのように開ける機能を知らないわけじゃないでしょ？

## 技術スタック

| 層             | 選択                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| ランタイム     | [Cloudflare Workers](https://workers.cloudflare.com/) + [D1](https://developers.cloudflare.com/d1/) (SQLite) + Cron Triggers |
| API            | [Hono](https://hono.dev/) (型付き RPC クライアント) + [Zod](https://zod.dev/) |
| 認証           | [Better Auth](https://www.better-auth.com/) (Google OAuth)                 |
| DB             | [Drizzle ORM](https://orm.drizzle.team/) + drizzle-kit マイグレーション    |
| フロントエンド | React 19, [TanStack Router](https://tanstack.com/router), [Mantine](https://mantine.dev/), [react-markdown](https://github.com/remarkjs/react-markdown), [CodeMirror 6](https://codemirror.net/) (エディタ) |
| ビルド         | [Vite](https://vite.dev/) + `@cloudflare/vite-plugin` + `vite-plugin-pwa`  |

## 開発

| コマンド                    | 内容                                                          |
| --------------------------- | ------------------------------------------------------------- |
| `npm run dev`               | 開発サーバー (Vite + workerd 上で Worker / ローカル D1)        |
| `npm run typecheck`         | `wrangler types` で `Env` を生成してから `tsc --build`         |
| `npm run build`             | `dist/client` (アセット) と `dist/poi` (Worker) をビルド      |
| `npm run preview`           | ビルド後、本番相当の環境でプレビュー                           |
| `npm run deploy`            | ビルドして `wrangler deploy`                                   |
| `npm run db:generate`       | スキーマ差分からマイグレーション SQL を生成 (`drizzle/`)       |
| `npm run db:migrate:local`  | ローカル D1 にマイグレーション適用                              |
| `npm run db:migrate:remote` | 本番 D1 にマイグレーション適用                                  |
| `npm run auth:schema`       | Better Auth の設定から `worker/db/schema.ts` を再生成          |

CI (`.github/workflows/ci.yml`) が PR ごとに `npm run typecheck && npm run build` を実行する。

```
src/        React SPA (TanStack Router のルート、Board コンポーネント、オフライン / PWA まわり)
worker/     Hono API、Better Auth、Drizzle スキーマ、期限切れセクションを消す Cron
drizzle/    マイグレーション SQL
public/     PWA アイコン
```

板エディタ、`/api/board` の仕様、期限切れ削除の Cron、PWA のキャッシュ、オフライン時の挙動などの詳細は、
それぞれのファイル冒頭のコメント (`src/components/Board.tsx`、`src/components/SectionEditor.tsx`、
`src/lib/section-markdown.ts`、`worker/memo/routes.ts`、`worker/memo/sweep.ts`、
`vite.config.ts`、`src/routes/index.tsx`) に書いてある。

## コントリビュート

バグ報告・提案・Pull Request を歓迎します。[CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。
脆弱性は [SECURITY.md](./SECURITY.md) の手順で非公開に報告してください。

## ライセンス

[MIT](./LICENSE) © Hayashi Naoki
