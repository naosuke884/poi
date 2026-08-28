# poi

TanStack Router (SPA) + Hono (API) + Better Auth (Google ログイン) + D1 + Mantine を
1 つの Cloudflare Worker で動かす構成。

アプリは「板」1 枚: ログインすると「セクション」ごとの Textarea が縦に並び、書いた内容は自動保存される。
空行 (Enter 2 回) で次のセクションに分かれ、セクションごとに「書いてから 30 日」で消える
(セクション単位で期限を持ち、Cron がセクション単位で削除する)。

```
├── .github/workflows/
│   ├── ci.yml                # CI: PR / main への push で npm ci → typecheck → build (下記「CI」)
│   └── deploy.yml            # main への push で wrangler deploy (vars.ENABLE_DEPLOY=true のときだけ動く)
├── .node-version             # Node のメジャーバージョン (CI の setup-node と package.json の engines で共有)
├── src/                      # フロントエンド (React + Mantine + TanStack Router)
│   ├── routes/               # file-based routing
│   │   ├── __root.tsx        #   AppShell レイアウト + ヘッダー
│   │   ├── index.tsx         #   /          板 (要ログイン: beforeLoad でガード)。オフライン時はキャッシュを閲覧のみで表示
│   │   └── login.tsx         #   /login     (Google でログイン)
│   ├── components/UserMenu.tsx
│   ├── components/Board.tsx  # 板 (セクションごとの Textarea / 分割・結合・移動のキー操作 / debounce 自動保存 / 保存状態 / オフライン時は保持して復帰後に再送)
│   ├── components/PwaUpdateBanner.tsx # Service Worker 登録 + 新バージョン検知時の「更新があります」バナー
│   ├── components/OfflineBanner.tsx   # navigator.onLine を見て「オフラインです」バナー。復帰時に router.invalidate()
│   ├── components/RouteErrorFallback.tsx # loader / beforeLoad の例外の共通表示 (defaultErrorComponent)。「再試行」付き
│   ├── lib/api.ts            # Hono RPC クライアント (型安全な fetch)
│   ├── lib/auth-client.ts    # Better Auth クライアント (useSession / signIn / signOut)
│   ├── lib/require-login.ts  # ログイン必須ルート用の beforeLoad ガード (未ログインなら /login へ。オフラインはキャッシュしたユーザーで通す)
│   ├── lib/board.ts          # 画面上のセクションの型と保存用の変換 (toDraft / sameDraft)、空行での分割 (splitAtSeparator)、日付フォーマット
│   ├── lib/board-cache.ts    # オフライン閲覧用の板のキャッシュ (localStorage、ユーザー id ごと)
│   ├── lib/session-cache.ts  # オフライン起動用にログイン中ユーザーをキャッシュ
│   ├── lib/local-storage.ts  # localStorage の try/catch ラッパー
│   ├── lib/offline.ts        # OfflineError / isOffline / fetchOrOffline (ネットワークエラーの判定)
│   ├── lib/use-online.ts     # useOnline(): navigator.onLine + online/offline イベント
│   ├── routeTree.gen.ts      # 自動生成 (編集不要)
│   └── vite-env.d.ts         # vite/client + vite-plugin-pwa/react の型参照 (virtual:pwa-register/react)
├── public/                   # そのまま配信される静的ファイル (PWA アイコン: pwa-192x192 / pwa-512x512 / maskable / apple-touch-icon / icon.svg)
├── worker/
│   ├── index.ts              # Hono アプリ: /api/auth/* (Better Auth), /api/board。scheduled ハンドラ (Cron) もここ
│   ├── middleware.ts         # authMiddleware (セッション解決) / requireAuth (401 ガード)
│   ├── auth.ts               # createAuth(env): Better Auth + Drizzle(D1) + Google
│   ├── db/schema.ts          # Drizzle スキーマ (Better Auth CLI が生成。手で編集しない)
│   ├── db/memo.ts            # Drizzle スキーマ (アプリ独自: memo テーブル = 板の 1 セクション)
│   ├── memo/constants.ts     # セクションの保持期間 (30 日) / 区切り文字列 / 板の文字数・セクション数上限 (boardLength)。src/ からも参照
│   ├── memo/routes.ts        # 板 API (GET / PUT /api/board)。zod でバリデーション
│   ├── memo/sweep.ts         # 期限切れのセクションの物理削除 (deleteExpiredMemos)。Cron から呼ぶ
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
  - `/api/board` … 板の取得 / 保存 (下記)
- `/__scheduled` … `wrangler dev --test-scheduled` で Cron をローカル実行するための経路 (下記)。
  静的アセットに取られないよう `run_worker_first` に含めている (本番では SPA フォールバックになるだけ)
- それ以外 … 静的アセットがあればそれを返し、無ければ `index.html` (SPA フォールバック)
  - `/sw.js` / `/manifest.webmanifest` / `/pwa-*.png` などの PWA 用ファイルもここ (Worker を通らず静的配信)

### 画面

| Path         | 内容                                                                                   |
| ------------ | -------------------------------------------------------------------------------------- |
| `/`          | 板 (要ログイン)。セクションごとの Textarea。オフライン時は前回取得分を閲覧のみで表示        |
| `/login`     | Google でログイン。`?redirect=` があればログイン後にそこへ戻る                            |

- ログイン必須ページは `beforeLoad` で `src/lib/require-login.ts` の `requireLogin` を呼ぶ
  (未ログインなら `/login?redirect=<元の URL>` へ)

### 板 (`src/components/Board.tsx`)

- セクション (= `memo` 1 行) ごとに 1 つの `Textarea` を縦に並べる (Notion のブロックのような構造)。
  各 Textarea が自分のセクションの id / 期限を持ち、下に「YYYY/MM/DD に消えます」(未保存なら「新しいセクション」) と
  削除ボタンを出す。末尾に「+ セクションを追加」。板が空なら空のセクションを 1 つ出す
- キー操作 (`src/lib/board.ts` の `splitAtSeparator` と `Board.tsx` の `onKeyDown`。IME の変換中は無視する):
  - 空行 (`SECTION_SEPARATOR = "\n\n"`) が入力されたら (Enter 2 回や貼り付け) その場で分け、カーソルのある側の
    Textarea へ移る。先頭の部分が元のセクション (id = 期限を維持)、残りは新しいセクション。
    区切りちょうどで分けるだけなので、改行 3 つなら余りは次のセクションの先頭に残る
  - 先頭で Backspace → 前のセクションと結合 (前の id が残る)。末尾で Delete → 次と結合
  - 1 行目で ↑ → 前のセクションの末尾へ。最終行で ↓ → 次のセクションの先頭へ (折り返しは考慮しない)
- 保存ボタンは無く、入力停止から 1 秒 (`AUTOSAVE_DELAY_MS`) 後に `PUT /api/board` で丸ごと保存する。
  保存中に入力があれば完了後に続けて保存する。
  空のセクションは送らない (= サーバから消える) が画面には残り、書き足せば新しいセクションとして保存される (`toDraft`)。
  レスポンスは送った順に並ぶので、送ったセクションにサーバの id / `expiresAt` を書き戻す (画面内の `key` で対応付ける)
- 保存状態を右上に表示: 未保存の変更があります / 保存中… / 保存済み / 保存に失敗 (「再試行」ボタン付き) /
  オフラインです。オンライン復帰後に再保存してください (「再試行」付き。`online` イベントでも自動再送。下記「オフライン時の挙動」)。
  未保存の間はタブを閉じる・リロード時に `beforeunload` で確認を出す
- 文字数カウンタは `worker/memo/constants.ts` の `boardLength` (区切りを含めた板全体の長さ) と `BOARD_MAX_LENGTH`。
  文字数またはセクション数 (`BOARD_MAX_SECTIONS`) が上限を超えると保存せずエラー表示

## 板 API (`/api/board`)

すべて `requireAuth` (未ログインは 401)。自分のセクションだけを扱い、期限切れのセクションは無い扱い。

| Method | Path         | 内容                                                                                   |
| ------ | ------------ | -------------------------------------------------------------------------------------- |
| GET    | `/api/board` | 板の全セクション (`position`, `createdAt` 昇順、未期限切れのみ)                           |
| PUT    | `/api/board` | 板を丸ごと置き換える。保存後の全セクションを返す                                        |

- `PUT` のリクエストボディ: `{ sections: { id: string \| null, content: string }[] }`
  (`content` は 1 セクション分のテキスト。単独の改行は含んでよいが、区切りの空行 `"\n\n"` と CR は不可。空でも 1 セクション。
  板全体で 20,000 文字 / 1,000 セクションまで。上限と区切りは `worker/memo/constants.ts`)
- `PUT` の処理: `id` が自分の既存のセクションと一致すれば `content` / `position` だけ更新 (`createdAt` / `expiresAt` は維持 = 延命しない。
  変化が無いセクションは触らない)。それ以外は `expiresAt = createdAt + 30 日` で新規作成。送られてこなかった既存のセクションは削除。
  すべて `db.batch` で 1 トランザクションとして実行する
- バリデーションエラーは `400 { error: "Bad Request", issues: [...] }` (zod の issues)
- フロントからは `src/lib/api.ts` の `api.board.$get()` / `api.board.$put({ json })` を型付きで呼べる

## 期限切れのセクションの自動削除 (Cron)

API 側の `expiresAt > now` フィルタは「見えなくする」だけで DB には残るため、
Cron Trigger で物理削除して「1 ヶ月で必ず消える」を保証する。削除はセクション単位 (`memo` テーブルの 1 行 = 板の 1 セクション)。

- `wrangler.jsonc` の `triggers.crons` (`"0 * * * *"`: 毎時 0 分) で起動
- `worker/index.ts` の `scheduled` ハンドラが `worker/memo/sweep.ts` の `deleteExpiredMemos(db, now)` を呼び、
  `DELETE FROM memo WHERE expires_at <= now` を実行する (`now` は `controller.scheduledTime`)
- 削除件数を `[memo sweep] deleted N expired section(s) ...` と `console.log` に出す
  (`observability` が有効なので本番では Workers Logs で確認できる)

### ローカルで確認する

`npm run dev` (Vite) では `--test-scheduled` が使えないので、`wrangler dev` を直接起動する。
`wrangler.jsonc` は `assets.directory` を持たない (Vite プラグインが補う) ため `--assets dist/client` を渡す。
`.wrangler/deploy/config.json` によるビルド済み設定へのリダイレクトは `--config` を明示すると無効になり、
`worker/index.ts` を wrangler 自身がバンドルするので `/__scheduled` のミドルウェアが有効になる
(ビルド済み設定は `no_bundle` のためミドルウェアが挟まらず `/__scheduled` が動かない)。

```sh
npm run build   # dist/client (アセット) を作る。Worker 自体は wrangler が worker/index.ts から直接バンドルする

# 期限切れ (expires_at = 0) と期限内 (+1 日) のセクションを 1 件ずつ入れる
# (memo.user_id は user.id への FK なので、ログイン済みユーザーの id を使うか、テスト用の user を先に入れる)
npx wrangler d1 execute poi --local --command "
  INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
    VALUES ('cron-test-user', 'cron', 'cron-test@example.com', 1, strftime('%s','now')*1000, strftime('%s','now')*1000);
  INSERT INTO memo (id, user_id, content, position, created_at, updated_at, expires_at) VALUES
    ('cron-expired', 'cron-test-user', 'expired', 0, 0, 0, 0),
    ('cron-valid',   'cron-test-user', 'valid',   1, 0, 0, strftime('%s','now')*1000 + 86400000);"

npx wrangler dev --config wrangler.jsonc --assets dist/client --test-scheduled   # http://localhost:8787
```

別ターミナルで Cron を発火させ、期限切れのセクションだけ消えることを確認する。

```sh
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
# => Ran scheduled event
#    wrangler dev 側のログ: [memo sweep] deleted 1 expired line(s) (cron: 0 * * * *, scheduledTime: ...)

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
  押すと `updateServiceWorker(true)` → 新 SW 有効化 → リロード (未保存の変更があれば `Board` の `beforeunload` で確認が出る)

### ローカルで確認する

```sh
npm run build
ls dist/client   # sw.js / manifest.webmanifest / workbox-*.js / pwa-*.png が含まれる
npx wrangler dev --config wrangler.jsonc --assets dist/client   # http://localhost:8787

curl -I http://localhost:8787/sw.js                 # 200, text/javascript (静的配信)
curl -I http://localhost:8787/manifest.webmanifest  # 200, application/manifest+json
curl -i http://localhost:8787/api/board             # 401 {"error":"Unauthorized"} (Worker が処理)
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
- **キャッシュ** (`src/lib/board-cache.ts`, `localStorage`): 板 (`GET /api/board`) の loader が成功するたび、
  および保存成功時に上書きする。キーはユーザー id ごと (`poi:board-cache:v2:<userId>`。v1 は行単位だった頃の形式で、
  読まずにログアウト時に消すだけ)。読むときに期限切れのセクションは除く。
  `localStorage` が使えない (プライベートモード / 容量超過) 場合は `src/lib/local-storage.ts` が握りつぶし、
  単にキャッシュが無い扱いになる
- **ログイン状態** (`src/lib/session-cache.ts`): `requireLogin` は `getSession` の fetch 自体が失敗 (ネットワーク断) したら
  前回キャッシュしたユーザー情報 (`poi:session:v1`) で通す。サーバが「未ログイン」と答えた場合はキャッシュを消して
  `/login` へ。ログアウト時 (`UserMenu`) もキャッシュを全部消す。ヘッダーのユーザー表示もキャッシュから出す
  (ログアウトはオフラインでは押せない。押せる状態で `signOut` が通信エラーになった場合は
  「オフラインのためログアウトできません」を出し、キャッシュは消さない)。
  セッションの取り直しはオフライン → オンラインに戻った瞬間だけ行う (失敗のたびに再取得するとループするため)
- **板 (`/`)**
  - loader の fetch がネットワークエラー (`src/lib/offline.ts` の `OfflineError`) なら
    キャッシュした板を `offline: true` で返す。キャッシュも無ければ `OfflineError` を throw →
    `src/components/RouteErrorFallback.tsx` (`createRouter` の `defaultErrorComponent`) が「再試行」付きで表示する
  - 最初からキャッシュでしか開けなかったときは閲覧のみ (`Board` の `readOnly`。「オフラインのため閲覧のみです」を表示)。
    オンライン復帰時の `invalidate` で最新を取得したら `key` が変わって `Board` を作り直す。
    一度オンラインで開いていれば、復帰直後の再取得がまだ失敗して loader がキャッシュを返しても
    閲覧のみに切り替えない (作り直すとオフラインで入力した未保存分が失われるため)
  - オンラインで開いた後にオフラインになった場合: 自動保存は `navigator.onLine === false` なら送らず、
    fetch が失敗した場合も含めて右上に「オフラインです。オンライン復帰後に再保存してください」(+「再試行」) を出す。
    入力内容はそのまま保持し、`online` イベントで自動的に再送する (手動の「再試行」でも可)。
    この状態で SPA 内の別ページへ移動しようとすると `useBlocker` で確認を出す (離れると失われるため)。
    タブを閉じる / リロードは従来どおり `beforeunload` で確認
- **Service Worker**: ナビゲーションは `navigateFallback: /index.html` で precache から返るので、
  機内モードで PWA を起動してもアプリ本体は起動する。
  `/api/*` はキャッシュしないので、データはすべて上記の `localStorage` キャッシュから出す

### ローカルで確認する

ブラウザの DevTools (Network → Offline / Application → Service Workers → Offline) で確認する。

1. オンラインで `/` を一度開く (キャッシュが作られる)
2. Offline にしてリロード → 「オフラインのため閲覧のみです」付きで前回の内容が表示される
3. オンラインで開いたまま Offline にして入力 → 「オフラインです。オンライン復帰後に再保存してください」
4. Online に戻す → 自動で `PUT` され「保存済み」になる

キャッシュ / オフライン判定のヘルパーは DOM 無しでも動くので、node で単体確認できる
(`localStorage` をモックして `src/lib/board-cache.ts` / `src/lib/offline.ts` を呼ぶ)。
`src/lib/board.ts` の `splitAtSeparator` / `toDraft` も同様に node で確認できる。

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
| `npm run auth:schema`       | Better Auth の設定から `worker/db/schema.ts` を再生成 (`auth` CLI。better-auth と同じバージョンに固定すること) |
| `npm run db:generate`       | スキーマ差分からマイグレーション SQL を生成 (`drizzle/`)       |
| `npm run db:migrate:local`  | ローカル D1 にマイグレーション適用                              |
| `npm run db:migrate:remote` | 本番 D1 にマイグレーション適用                                  |

## CI (GitHub Actions)

`.github/workflows/ci.yml` が PR (全ブランチ向け) と `main` への push で次を実行し、
PR にステータスチェックとして表示される。型エラー / ビルドエラーがあると落ちる。

1. `actions/checkout` → `actions/setup-node` (`.node-version` の Node、npm キャッシュ有効)
2. `npm ci`
3. `npm run typecheck` … `wrangler types` で `worker-configuration.d.ts` (D1 バインディング等の `Env`) を生成してから `tsc --build`。
   `wrangler types` は `wrangler.jsonc` からローカルで型を作るだけなので Cloudflare の認証情報 (secrets) は不要
4. `npm run build`

- Node のバージョンは `.node-version` (メジャーのみ) と `package.json` の `engines.node` で固定している。
  上げるときは両方を揃えて変更する
- `concurrency` で同じ PR / ブランチの古い run は自動でキャンセルされる
- ローカルで CI と同じ確認をするには `npm run typecheck && npm run build`

## 本番デプロイ

「環境横断で使える」ための本番 URL を用意する手順。初回は 1〜7 をすべて、2 回目以降は 7 だけでよい
(GitHub Actions からデプロイする場合は下記「GitHub Actions からデプロイする」)。

1. Cloudflare にログイン
   ```sh
   npx wrangler login
   ```
2. D1 を作成し、出力された `database_id` を `wrangler.jsonc` の `d1_databases[0].database_id` に貼る
   ```sh
   npx wrangler d1 create poi
   ```
3. 本番 D1 にマイグレーションを適用
   ```sh
   npm run db:migrate:remote
   ```
4. Secrets を登録 (`.dev.vars` の値と同じ名前。値はリポジトリに入れない)
   ```sh
   openssl rand -base64 32 | npx wrangler secret put BETTER_AUTH_SECRET
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
5. Google Cloud Console > APIs & Services > Credentials > 使っている OAuth クライアントに
   本番の redirect URI `https://<本番ドメイン>/api/auth/callback/google` を追加する
   (`poi.<account>.workers.dev` でも、カスタムドメインでもよい。両方使うなら両方登録)
6. (任意) カスタムドメイン: `wrangler.jsonc` の `routes` のコメントを外してドメインを書く
   (ゾーンが同じ Cloudflare アカウントにあること)
7. ビルドしてデプロイ
   ```sh
   npm run deploy
   ```

### デプロイ後の確認

- `https://<本番ドメイン>/` → `/login` にリダイレクト → Google でログインできる
- 板に書く → 別端末 (スマホなど) で同じアカウントでログイン → 同じ内容が見える
- `https://<本番ドメイン>/api/board` (未ログイン) → `401 {"error":"Unauthorized"}`
- `https://<本番ドメイン>/sw.js` / `/manifest.webmanifest` → 200。Chrome DevTools > Application で SW が登録され、
  Lighthouse の PWA installable が通る (HTTPS が必要なので本番でしか確認できない)
- Cloudflare ダッシュボード > Workers & Pages > poi > Logs で毎時 `[memo sweep] deleted N ...` が出る
- `git status` でシークレットが含まれていないこと (`.dev.vars*` は `.gitignore` 済み)

### 補足

- `BETTER_AUTH_URL` は未設定ならリクエストの origin が使われる (`worker/auth.ts`)。
  `workers.dev` とカスタムドメインの両方でログインを許可したい場合はそのままでよい。
  1 つの origin に固定したい (別 origin からの Cookie を拒否したい) 場合だけ `wrangler secret put BETTER_AUTH_URL` で設定する。
- Better Auth の `trustedOrigins` は既定で `baseURL` の origin だけなので、上記の挙動と一致する。
- `wrangler.jsonc` は `wrangler deploy` 時にも読まれるため、`database_id` は必ず本物に置き換えること
  (ダミーのままだと `binding DB ... database_id not found` でデプロイに失敗する)。

### GitHub Actions からデプロイする

`.github/workflows/deploy.yml` は `main` への push (と手動の `workflow_dispatch`) で
`npm ci` → `npm run typecheck` → `npm run build` → `npm run db:migrate:remote` → `wrangler deploy`
(`cloudflare/wrangler-action`) を実行する。

job 全体が `if: vars.ENABLE_DEPLOY == 'true'` でガードされているので、**既定では何もしない** (スキップ扱い)。
上記 1〜6 を済ませたうえで、GitHub リポジトリの Settings > Secrets and variables > Actions に次を登録すると有効になる。

| 種類     | 名前                    | 値                                                                                         |
| -------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| Variable | `ENABLE_DEPLOY`         | `true`                                                                                     |
| Secret   | `CLOUDFLARE_API_TOKEN`  | Cloudflare ダッシュボード > My Profile > API Tokens で作る。テンプレート「Edit Cloudflare Workers」に D1 の Edit 権限を足す |
| Secret   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare ダッシュボード > Workers & Pages の右側に表示される Account ID                    |

- `BETTER_AUTH_SECRET` などの Worker の Secrets は手順 4 の `wrangler secret put` で登録済みのものがそのまま使われる
  (GitHub 側に登録する必要はない)
- 本番 D1 のマイグレーション (`npm run db:migrate:remote`) はデプロイ前に毎回実行する。適用済みのものはスキップされる
- 無効に戻すときは `ENABLE_DEPLOY` を `true` 以外にする (削除でもよい)。以後は手元の `npm run deploy` だけになる
- `concurrency` で `main` へ連続 push したときは古いデプロイ run がキャンセルされ、最新のものだけが走る

## スキーマを変更するとき

1. Better Auth のプラグイン追加など → `npm run auth:schema`
   (アプリ独自のテーブルは `worker/db/memo.ts` など別ファイルに追加し、`drizzle.config.ts` の `schema` に含める)
2. `npm run db:generate` → `drizzle/` に SQL が生成される
3. `npm run db:migrate:local` / `db:migrate:remote`
