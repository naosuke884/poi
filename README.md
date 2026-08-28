# poi

TanStack Router (SPA) + Hono (API) + Better Auth (Google ログイン) + D1 + Mantine を
1 つの Cloudflare Worker で動かす構成。

```
├── src/                      # フロントエンド (React + Mantine + TanStack Router)
│   ├── routes/               # file-based routing
│   │   ├── __root.tsx        #   AppShell レイアウト + ヘッダー
│   │   ├── index.tsx         #   /          メモ一覧 (要ログイン: beforeLoad でガード)
│   │   ├── login.tsx         #   /login     (Google でログイン)
│   │   ├── memos/new.tsx     #   /memos/new メモ作成 (最初の入力で POST → /memos/$id へ replace 遷移)
│   │   └── memos/$id.tsx     #   /memos/:id メモ編集 (自動保存)。404 は notFoundComponent
│   ├── components/UserMenu.tsx
│   ├── components/MemoEditor.tsx # 作成・編集で共有するエディタ (debounce 自動保存 / 保存状態 / 期限表示)
│   ├── lib/api.ts            # Hono RPC クライアント (型安全な fetch)
│   ├── lib/auth-client.ts    # Better Auth クライアント (useSession / signIn / signOut)
│   ├── lib/require-login.ts  # ログイン必須ルート用の beforeLoad ガード (未ログインなら /login へ)
│   ├── lib/memo.ts           # 残り日数 / 表示タイトル / 日付フォーマットなどのヘルパー
│   └── routeTree.gen.ts      # 自動生成 (編集不要)
├── worker/
│   ├── index.ts              # Hono アプリ: /api/auth/* (Better Auth), /api/memos
│   ├── middleware.ts         # authMiddleware (セッション解決) / requireAuth (401 ガード)
│   ├── auth.ts               # createAuth(env): Better Auth + Drizzle(D1) + Google
│   ├── db/schema.ts          # Drizzle スキーマ (Better Auth CLI が生成。手で編集しない)
│   ├── db/memo.ts            # Drizzle スキーマ (アプリ独自: memo テーブル)
│   ├── memo/constants.ts     # メモの保持期間 (30 日) / 文字数上限。src/ からも参照
│   ├── memo/routes.ts        # メモ CRUD API (/api/memos)。zod でバリデーション
│   └── env.d.ts              # シークレットの型を Env にマージ
├── drizzle/                  # マイグレーション SQL (drizzle-kit generate の出力)
├── wrangler.jsonc            # Workers 設定 (assets + SPA fallback + D1)
├── better-auth.config.ts     # Better Auth CLI 用 (スキーマ生成)
├── drizzle.config.ts
├── postcss.config.cjs        # Mantine 用 PostCSS
└── vite.config.ts            # tanstackRouter + react + cloudflare
```

## ルーティング

- `/api/*` … `run_worker_first` で常に Worker (Hono) が処理
  - `/api/auth/*` … Better Auth のハンドラ
  - それ以外は `authMiddleware` でセッション解決済み。`requireAuth` で 401 ガード
  - `/api/memos` … メモ CRUD (下記)
- それ以外 … 静的アセットがあればそれを返し、無ければ `index.html` (SPA フォールバック)

### 画面

| Path         | 内容                                                                                   |
| ------------ | -------------------------------------------------------------------------------------- |
| `/`          | メモ一覧 (要ログイン)。タイトル (無ければ本文の先頭行) / 更新日時 / 残り日数を表示。カードのタイトルから編集画面へ。削除は確認ダイアログ付き |
| `/login`     | Google でログイン。`?redirect=` があればログイン後にそこへ戻る                            |
| `/memos/new` | メモ作成 (要ログイン)。最初の入力で `POST /api/memos` し、`/memos/:id` へ `replace` 遷移       |
| `/memos/:id` | メモ編集 (要ログイン)。期限切れ・存在しない id は 404 表示 (`notFoundComponent`)          |

- ログイン必須ページは `beforeLoad` で `src/lib/require-login.ts` の `requireLogin` を呼ぶ
  (未ログインなら `/login?redirect=<元の URL>` へ)
- 残り日数は `expiresAt` から `src/lib/memo.ts` の `remainingDays` で算出し、
  3 日以下 (`MEMO_EXPIRY_WARNING_DAYS`) は警告色で表示する

### メモ編集画面 (`src/components/MemoEditor.tsx`)

- 保存ボタンは無く、入力停止から 1 秒 (`AUTOSAVE_DELAY_MS`) 後に自動保存する
  - 新規 (`/memos/new`) は最初の入力で `POST`、以降は `PATCH`。保存中に入力があれば完了後に続けて保存する
  - `POST` 直後の `/memos/$id` への遷移でエディタは作り直されるが、遷移中の入力とカーソル位置は
    モジュール内の `handoff` 経由で新しいエディタに引き継ぐ
  - 本文が空の間は保存しない (API が `content` を 1 文字以上要求するため)
- 保存状態を右上に表示: 未保存の変更があります / 保存中… / 保存済み / 保存に失敗 (「再試行」ボタン付き)。
  未保存の間はタブを閉じる・リロード時に `beforeunload` で確認を出す
- 期限日を「このメモは YYYY/MM/DD に消えます」と表示 (`expiresAt` を `formatDate` で整形)
- タイトル / 本文の `maxLength` と文字数カウンタは `worker/memo/constants.ts` の上限を使う

## メモ API (`/api/memos`)

すべて `requireAuth` (未ログインは 401)。自分のメモ以外・期限切れのメモはすべて 404 扱い。

| Method | Path              | 内容                                                                     |
| ------ | ----------------- | ------------------------------------------------------------------------ |
| GET    | `/api/memos`      | 自分のメモ一覧 (`updatedAt` 降順、未期限切れのみ)                          |
| POST   | `/api/memos`      | 作成。`expiresAt = createdAt + 30 日` をサーバ側で確定 (201)              |
| GET    | `/api/memos/:id`  | 1 件取得                                                                 |
| PATCH  | `/api/memos/:id`  | `title` / `content` を更新。`expiresAt` は更新不可 (延命しない)          |
| DELETE | `/api/memos/:id`  | 削除。`{ id }` を返す                                                    |

- リクエストボディ: `{ title?: string \| null, content: string }`
  (`content` は 1〜20,000 文字、`title` は 200 文字まで。上限は `worker/memo/constants.ts`)
- バリデーションエラーは `400 { error: "Bad Request", issues: [...] }` (zod の issues)
- フロントからは `src/lib/api.ts` の `api.memos.$get()` / `api.memos[":id"].$patch(...)` などを型付きで呼べる

## 初回セットアップ

```sh
npm install
cp .dev.vars.example .dev.vars   # BETTER_AUTH_SECRET / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET を設定
npm run db:migrate:local         # ローカル D1 にマイグレーション適用
npm run dev                      # http://localhost:5173
```

Google Cloud Console で OAuth 2.0 クライアント (Web application) を作成し、
Authorized redirect URI に `http://localhost:5173/api/auth/callback/google` を登録する。

## コマンド

| コマンド                    | 内容                                                          |
| --------------------------- | ------------------------------------------------------------- |
| `npm run dev`               | 開発サーバー (Vite + workerd 上で Worker / ローカル D1 も動く) |
| `npm run build`             | `dist/client` (アセット) と `dist/poi` (Worker) をビルド      |
| `npm run preview`           | ビルド後、本番相当の環境でプレビュー                           |
| `npm run typecheck`         | `wrangler types` で `Env` を生成してから `tsc --build`         |
| `npm run deploy`            | ビルドして `wrangler deploy`                                   |
| `npm run auth:schema`       | Better Auth の設定から `worker/db/schema.ts` を再生成          |
| `npm run db:generate`       | スキーマ差分からマイグレーション SQL を生成 (`drizzle/`)       |
| `npm run db:migrate:local`  | ローカル D1 にマイグレーション適用                              |
| `npm run db:migrate:remote` | 本番 D1 にマイグレーション適用                                  |

## 本番デプロイ

```sh
npx wrangler login
npx wrangler d1 create poi            # 出力の database_id を wrangler.jsonc に反映
npm run db:migrate:remote
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npm run deploy
```

本番の redirect URI `https://<your-domain>/api/auth/callback/google` も Google 側に登録する。
`BETTER_AUTH_URL` は未設定ならリクエストの origin が使われる (カスタムドメインを固定したい場合のみ設定)。

## スキーマを変更するとき

1. Better Auth のプラグイン追加など → `npm run auth:schema`
   (アプリ独自のテーブルは `worker/db/memo.ts` など別ファイルに追加し、`drizzle.config.ts` の `schema` に含める)
2. `npm run db:generate` → `drizzle/` に SQL が生成される
3. `npm run db:migrate:local` / `db:migrate:remote`
