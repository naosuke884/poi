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

## コントリビュート

バグ報告・提案・Pull Request を歓迎します。[CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。
脆弱性は [SECURITY.md](./SECURITY.md) の手順で非公開に報告してください。

## ライセンス

[MIT](./LICENSE) © Hayashi Naoki
