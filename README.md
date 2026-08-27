# poi

TanStack Router (SPA) + Hono (API) を 1 つの Cloudflare Worker で動かす構成。

```
├── src/                  # フロントエンド (React + TanStack Router, file-based routing)
│   ├── routes/           # ルート定義 (__root.tsx, index.tsx, about.tsx ...)
│   ├── routeTree.gen.ts  # 自動生成 (編集不要)
│   └── lib/api.ts        # Hono RPC クライアント (型安全な fetch)
├── worker/index.ts       # Hono アプリ (/api/* を処理)
├── wrangler.jsonc        # Cloudflare Workers 設定 (static assets + SPA fallback)
└── vite.config.ts        # tanstackRouter + react + cloudflare プラグイン
```

## ルーティング

- `/api/*` … `run_worker_first` で常に Worker (Hono) が処理
- それ以外 … 静的アセットがあればそれを返し、無ければ `index.html` (SPA フォールバック)
- Worker 側で未定義の `/api/*` は `404 JSON`、それ以外は `ASSETS` にフォールバック

## コマンド

| コマンド            | 内容                                                       |
| ------------------- | ---------------------------------------------------------- |
| `npm run dev`       | 開発サーバー (Vite + workerd 上で Worker も動く)           |
| `npm run build`     | `dist/client` (アセット) と `dist/poi` (Worker) をビルド   |
| `npm run preview`   | ビルド後、本番相当の環境でプレビュー                        |
| `npm run typecheck` | `wrangler types` で `Env` を生成してから `tsc --build`      |
| `npm run deploy`    | ビルドして `wrangler deploy` (要 `wrangler login`)          |

## Bindings を追加するとき

1. `wrangler.jsonc` に binding (KV / D1 / R2 など) を追加
2. `npm run cf-typegen` で `worker-configuration.d.ts` の `Env` を更新
3. `worker/index.ts` で `c.env.XXX` として利用

`.dev.vars` にローカル用のシークレットを置けます (git 管理外)。
