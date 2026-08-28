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
│   ├── components/MemoEditor.tsx # 作成・編集で共有するエディタ (debounce 自動保存 / 保存状態 / 期限表示 / オフライン時は保持して復帰後に再送)
│   ├── components/PwaUpdateBanner.tsx # Service Worker 登録 + 新バージョン検知時の「更新があります」バナー
│   ├── components/OfflineBanner.tsx   # navigator.onLine を見て「オフラインです」バナー。復帰時に router.invalidate()
│   ├── components/RouteErrorFallback.tsx # loader / beforeLoad の例外の共通表示 (defaultErrorComponent)。「再試行」付き
│   ├── lib/api.ts            # Hono RPC クライアント (型安全な fetch)
│   ├── lib/auth-client.ts    # Better Auth クライアント (useSession / signIn / signOut)
│   ├── lib/require-login.ts  # ログイン必須ルート用の beforeLoad ガード (未ログインなら /login へ。オフラインはキャッシュしたユーザーで通す)
│   ├── lib/memo.ts           # 残り日数 / 表示タイトル / 日付フォーマットなどのヘルパー
│   ├── lib/memo-cache.ts     # オフライン閲覧用のメモキャッシュ (localStorage、ユーザー id ごと)
│   ├── lib/session-cache.ts  # オフライン起動用にログイン中ユーザーをキャッシュ
│   ├── lib/local-storage.ts  # localStorage の try/catch ラッパー
│   ├── lib/offline.ts        # OfflineError / isOffline / fetchOrOffline (ネットワークエラーの判定)
│   ├── lib/use-online.ts     # useOnline(): navigator.onLine + online/offline イベント
│   ├── routeTree.gen.ts      # 自動生成 (編集不要)
│   └── vite-env.d.ts         # vite/client + vite-plugin-pwa/react の型参照 (virtual:pwa-register/react)
├── public/                   # そのまま配信される静的ファイル (PWA アイコン: pwa-192x192 / pwa-512x512 / maskable / apple-touch-icon / icon.svg)
├── worker/
│   ├── index.ts              # Hono アプリ: /api/auth/* (Better Auth), /api/memos。scheduled ハンドラ (Cron) もここ
│   ├── middleware.ts         # authMiddleware (セッション解決) / requireAuth (401 ガード)
│   ├── auth.ts               # createAuth(env): Better Auth + Drizzle(D1) + Google
│   ├── db/schema.ts          # Drizzle スキーマ (Better Auth CLI が生成。手で編集しない)
│   ├── db/memo.ts            # Drizzle スキーマ (アプリ独自: memo テーブル)
│   ├── memo/constants.ts     # メモの保持期間 (30 日) / 文字数上限。src/ からも参照
│   ├── memo/routes.ts        # メモ CRUD API (/api/memos)。zod でバリデーション
│   ├── memo/sweep.ts         # 期限切れメモの物理削除 (deleteExpiredMemos)。Cron から呼ぶ
│   └── env.d.ts              # シークレットの型を Env にマージ
├── drizzle/                  # マイグレーション SQL (drizzle-kit generate の出力)
├── wrangler.jsonc            # Workers 設定 (assets + SPA fallback + D1 + Cron Trigger)
├── better-auth.config.ts     # Better Auth CLI 用 (スキーマ生成)
├── drizzle.config.ts
├── postcss.config.cjs        # Mantine 用 PostCSS
├── index.html                # theme-color / apple-mobile-web-app-* meta、apple-touch-icon
└── vite.config.ts            # tanstackRouter + react + cloudflare + VitePWA (manifest / Service Worker)
```

## ルーティング

- `/api/*` … `run_worker_first` で常に Worker (Hono) が処理
  - `/api/auth/*` … Better Auth のハンドラ
  - それ以外は `authMiddleware` でセッション解決済み。`requireAuth` で 401 ガード
  - `/api/memos` … メモ CRUD (下記)
- `/__scheduled` … `wrangler dev --test-scheduled` で Cron をローカル実行するための経路 (下記)。
  静的アセットに取られないよう `run_worker_first` に含めている (本番では SPA フォールバックになるだけ)
- それ以外 … 静的アセットがあればそれを返し、無ければ `index.html` (SPA フォールバック)
  - `/sw.js` / `/manifest.webmanifest` / `/pwa-*.png` などの PWA 用ファイルもここ (Worker を通らず静的配信)

### 画面

| Path         | 内容                                                                                   |
| ------------ | -------------------------------------------------------------------------------------- |
| `/`          | メモ一覧 (要ログイン)。タイトル (無ければ本文の先頭行) / 更新日時 / 残り日数を表示。カードのタイトルから編集画面へ。削除は確認ダイアログ付き。オフライン時は前回取得分を読み取り専用で表示 |
| `/login`     | Google でログイン。`?redirect=` があればログイン後にそこへ戻る                            |
| `/memos/new` | メモ作成 (要ログイン)。最初の入力で `POST /api/memos` し、`/memos/:id` へ `replace` 遷移       |
| `/memos/:id` | メモ編集 (要ログイン)。期限切れ・存在しない id は 404 表示 (`notFoundComponent`)。オフライン時はキャッシュを閲覧のみで表示 |

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
- 保存状態を右上に表示: 未保存の変更があります / 保存中… / 保存済み / 保存に失敗 (「再試行」ボタン付き) /
  オフラインです。オンライン復帰後に再保存してください (「再試行」付き。`online` イベントでも自動再送。下記「オフライン時の挙動」)。
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

## 期限切れメモの自動削除 (Cron)

API 側の `expiresAt > now` フィルタは「見えなくする」だけで行は DB に残るため、
Cron Trigger で物理削除して「1 ヶ月で必ず消える」を保証する。

- `wrangler.jsonc` の `triggers.crons` (`"0 * * * *"`: 毎時 0 分) で起動
- `worker/index.ts` の `scheduled` ハンドラが `worker/memo/sweep.ts` の `deleteExpiredMemos(db, now)` を呼び、
  `DELETE FROM memo WHERE expires_at <= now` を実行する (`now` は `controller.scheduledTime`)
- 削除件数を `[memo sweep] deleted N expired memo(s) ...` と `console.log` に出す
  (`observability` が有効なので本番では Workers Logs で確認できる)

### ローカルで確認する

`npm run dev` (Vite) では `--test-scheduled` が使えないので、`wrangler dev` を直接起動する。
`wrangler.jsonc` は `assets.directory` を持たない (Vite プラグインが補う) ため `--assets dist/client` を渡す。
`.wrangler/deploy/config.json` によるビルド済み設定へのリダイレクトは `--config` を明示すると無効になり、
`worker/index.ts` を wrangler 自身がバンドルするので `/__scheduled` のミドルウェアが有効になる
(ビルド済み設定は `no_bundle` のためミドルウェアが挟まらず `/__scheduled` が動かない)。

```sh
npm run build   # dist/client (アセット) を作る。Worker 自体は wrangler が worker/index.ts から直接バンドルする

# 期限切れ (expires_at = 0) と期限内 (+1 日) のメモを 1 件ずつ入れる
# (memo.user_id は user.id への FK なので、ログイン済みユーザーの id を使うか、テスト用の user を先に入れる)
npx wrangler d1 execute poi --local --command "
  INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
    VALUES ('cron-test-user', 'cron', 'cron-test@example.com', 1, strftime('%s','now')*1000, strftime('%s','now')*1000);
  INSERT INTO memo (id, user_id, title, content, created_at, updated_at, expires_at) VALUES
    ('cron-expired', 'cron-test-user', 'expired', 'x', 0, 0, 0),
    ('cron-valid',   'cron-test-user', 'valid',   'y', 0, 0, strftime('%s','now')*1000 + 86400000);"

npx wrangler dev --config wrangler.jsonc --assets dist/client --test-scheduled   # http://localhost:8787
```

別ターミナルで Cron を発火させ、期限切れの行だけ消えることを確認する。

```sh
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
# => Ran scheduled event
#    wrangler dev 側のログ: [memo sweep] deleted 1 expired memo(s) (cron: 0 * * * *, scheduledTime: ...)

npx wrangler d1 execute poi --local --command "SELECT id FROM memo WHERE id LIKE 'cron-%';"
# => cron-valid だけ残る

# 後片付け
npx wrangler d1 execute poi --local --command "
  DELETE FROM memo WHERE user_id = 'cron-test-user'; DELETE FROM user WHERE id = 'cron-test-user';"
```

## PWA (ホーム画面への追加)

`vite-plugin-pwa` (`vite.config.ts` の `VitePWA`) で `manifest.webmanifest` と Service Worker (`sw.js`) を
`npm run build` 時に `dist/client` へ生成する。開発サーバー (`npm run dev`) では SW は登録されない
(`useRegisterSW` が no-op になる)。

- manifest: `name` / `short_name` = `poi`、`display: standalone`、`start_url: /`。
  `theme_color` (`#228be6` = Mantine `blue.6`) / `background_color` (`#ffffff`) は
  `index.html` の `theme-color` meta と揃えている
- アイコンは `public/` に置く (`pwa-192x192.png` / `pwa-512x512.png` / `pwa-maskable-512x512.png` (purpose: maskable) /
  `apple-touch-icon.png` (180px)。`icon.svg` は元絵兼ファビコン)
- Service Worker (Workbox `generateSW`) のキャッシュ戦略
  - ビルド成果物 (`/assets/*`、`index.html`、アイコン類) は precache。ハッシュ付きなので更新時は差分だけ取り直す
  - ナビゲーションは `index.html` を `navigateFallback` にする (オフラインでも SPA が起動する)。
    ただし `/api/*` (Better Auth のコールバック含む) と `/__scheduled` は `navigateFallbackDenylist` で除外
  - `/api/*` は **キャッシュしない**。`runtimeCaching` を一切定義していないので precache 対象外のリクエストは
    SW を素通りしてネットワークへ行く (NetworkOnly 相当)。認証付きレスポンスがキャッシュされないよう、
    `/api` 向けの `runtimeCaching` は今後も追加しないこと
- 更新: `registerType: "prompt"`。新しい SW はユーザーが「リロード」を押すまで待機する。
  autoUpdate (即時有効化 + 旧キャッシュ削除) だと開いたままの旧ページの遅延チャンクが消えて壊れうるため。
  `src/components/PwaUpdateBanner.tsx` が `needRefresh` を見て右下に「更新があります」+「リロード」ボタンを出し、
  押すと `updateServiceWorker(true)` → 新 SW 有効化 → リロード (未保存の変更があれば `MemoEditor` の `beforeunload` で確認が出る)

### ローカルで確認する

```sh
npm run build
ls dist/client   # sw.js / manifest.webmanifest / workbox-*.js / pwa-*.png が含まれる
npx wrangler dev --config wrangler.jsonc --assets dist/client   # http://localhost:8787

curl -I http://localhost:8787/sw.js                 # 200, text/javascript (静的配信)
curl -I http://localhost:8787/manifest.webmanifest  # 200, application/manifest+json
curl -i http://localhost:8787/api/memos             # 401 {"error":"Unauthorized"} (Worker が処理)
```

インストール可否 (Lighthouse の PWA チェック、iOS Safari / Android Chrome の「ホーム画面に追加」) は
HTTPS でデプロイした環境で実機 / DevTools から確認する。


## オフライン時の挙動

フルオフライン編集はスコープ外。「前回取得した内容の閲覧」と「分かりやすいエラー / 復帰時の再送」に留める
(複数端末の競合解決はせず last-write-wins)。

- **状態バナー**: `src/lib/use-online.ts` の `useOnline()` (`navigator.onLine` + `online` / `offline` イベント) を
  `src/components/OfflineBanner.tsx` が見て、オフラインの間はヘッダー下に「オフラインです」を出す。
  オフライン → オンラインに戻った瞬間に `router.invalidate()` で表示中ルートの loader を再実行し、
  キャッシュ表示を最新のデータで置き換える (= キャッシュもその時点で上書きされる)
- **キャッシュ** (`src/lib/memo-cache.ts`, `localStorage`): 一覧 (`GET /api/memos`) と 1 件 (`GET /api/memos/:id`) の
  loader が成功するたび、および編集画面の保存成功時に上書きする。キーはユーザー id ごと
  (`poi:memo-cache:v1:<userId>:list` / `...:memo:<id>`)。一覧を書くとき、一覧に無い id の詳細は削除する。
  `localStorage` が使えない (プライベートモード / 容量超過) 場合は `src/lib/local-storage.ts` が握りつぶし、
  単にキャッシュが無い扱いになる
- **ログイン状態** (`src/lib/session-cache.ts`): `requireLogin` は `getSession` の fetch 自体が失敗 (ネットワーク断) したら
  前回キャッシュしたユーザー情報 (`poi:session:v1`) で通す。サーバが「未ログイン」と答えた場合はキャッシュを消して
  `/login` へ。ログアウト時 (`UserMenu`) もキャッシュを全部消す。ヘッダーのユーザー表示もキャッシュから出す
  (ログアウトはオフラインでは押せない。押せる状態で `signOut` が通信エラーになった場合は
  「オフラインのためログアウトできません」を出し、キャッシュは消さない)。
  セッションの取り直しはオフライン → オンラインに戻った瞬間だけ行う (失敗のたびに再取得するとループするため)
- **一覧 (`/`)**: fetch がネットワークエラー (`src/lib/offline.ts` の `OfflineError`) なら
  キャッシュした一覧を `offline: true` で返し、「オフライン (読み取り専用 / 取得時刻)」バッジを出して削除ボタンを隠す。
  キャッシュも無ければ `OfflineError` を throw → `src/components/RouteErrorFallback.tsx`
  (`createRouter` の `defaultErrorComponent`) が「再試行」付きで表示する
- **編集画面 (`/memos/:id`)**
  - 最初からキャッシュでしか開けなかったときは閲覧のみ (`MemoEditor` の `readOnly`)。
    オンライン復帰時の `invalidate` で最新を取得したら `key` が変わってエディタを作り直す。
    一度オンラインで開いたメモは、復帰直後の再取得がまだ失敗して loader がキャッシュを返しても
    閲覧のみに切り替えない (作り直すとオフラインで入力した未保存分が失われるため)
  - オンラインで開いた後にオフラインになった場合: 自動保存は `navigator.onLine === false` なら送らず、
    fetch が失敗した場合も含めて右上に「オフラインです。オンライン復帰後に再保存してください」(+「再試行」) を出す。
    入力内容はそのまま保持し、`online` イベントで自動的に再送する (手動の「再試行」でも可)。
    この状態で SPA 内の別ページへ移動しようとすると `useBlocker` で確認を出す (離れると失われるため)。
    タブを閉じる / リロードは従来どおり `beforeunload` で確認
  - 新規作成 (`/memos/new`) も同じ: 最初の `POST` がオフラインで失敗したら復帰後に再送して `/memos/:id` へ遷移する
- **Service Worker**: ナビゲーションは `navigateFallback: /index.html` で precache から返るので、
  機内モードで PWA を起動しても (`/` でも `/memos/:id` でも) アプリ本体は起動する。
  `/api/*` はキャッシュしないので、データはすべて上記の `localStorage` キャッシュから出す

### ローカルで確認する

ブラウザの DevTools (Network → Offline / Application → Service Workers → Offline) で確認する。

1. オンラインで `/` と `/memos/:id` を一度開く (キャッシュが作られる)
2. Offline にしてリロード → 一覧が「オフライン (読み取り専用)」バッジ付きで表示される。メモを開くと閲覧のみ
3. オンラインで編集画面を開いたまま Offline にして入力 → 「オフラインです。オンライン復帰後に再保存してください」
4. Online に戻す → 自動で `PATCH` され「保存済み」になる。一覧に戻るとキャッシュも最新になっている

キャッシュ / オフライン判定のヘルパーは DOM 無しでも動くので、node で単体確認できる
(`localStorage` をモックして `src/lib/memo-cache.ts` / `src/lib/offline.ts` を呼ぶ)。

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
