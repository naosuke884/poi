import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, lazyPlugins } from "vite-plus";

import { LANDING_HTML, prerenderPages } from "./vite-plugins/prerender-pages.ts";

export default defineConfig({
  fmt: {
    printWidth: 100,
    sortImports: {},
    // Markdown は整形しない (表の桁揃えなどで文書の差分が大きくなるため。Biome のときも対象外だった)
    ignorePatterns: [
      "**/*.md",
      // worker/site/head.ts が 1 行の <meta> を前提に書き換えるので、属性ごとに折り返させない
      "index.html",
      "src/routeTree.gen.ts",
      "worker/auth/schema.ts",
      "drizzle/**",
      "public/**",
    ],
  },
  lint: {
    plugins: ["typescript", "unicorn", "oxc", "react", "jsx-a11y"],
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      "./lint-plugins/route-colocation.ts",
    ],
    ignorePatterns: ["src/routeTree.gen.ts", "worker/auth/schema.ts", "drizzle/**", "public/**"],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "poi/no-cross-route-import": "error",
      // 依存配列は意図して絞っている (ref 経由で最新値を読む) ので、足せという指摘は外す
      "react-hooks/exhaustive-deps": "off",
      // React Compiler 向けの規則。Compiler は使っておらず、描画中に ref の最新値を読む書き方を意図して使っている
      "react/refs": "off",
      "react/purity": "off",
      "react/globals": "off",
      "react/immutability": "off",
      "react/set-state-in-effect": "off",
      // CodeMirror のコマンドや vi.fn() は this を使わない関数なので、メソッドを外して渡しても壊れない
      "typescript/unbound-method": "off",
      // role="status" は Mantine の部品に付けている。<output> にするとフォームに属する要素になり意味が変わる
      "jsx-a11y/prefer-tag-over-role": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/routes/**", "@/routes/**"],
              message:
                "src/routes の外 (src/components, src/lib など) からルートの部品を import しない。共有するなら src/components / src/lib へ移す (route-colocation skill)",
            },
          ],
        },
      ],
    },
    overrides: [
      {
        files: ["shared/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  group: ["@/**", "@worker/**", "**/src/**", "**/worker/**"],
                  message:
                    "shared/ は src (ブラウザ) と worker (Workers) の両方から使うので、どちらにも依存しない",
                },
              ],
            },
          ],
        },
      },
    ],
    options: { typeAware: true, typeCheck: true },
  },
  server: {
    // dev container 内で動かすため、コンテナ外 (ホスト) からもアクセスできるよう全インターフェースで待ち受ける
    host: true,
    // ホスト側は 5173 前提でポートフォワードしている。塞がっていたら別ポートに黙って移らず失敗させる
    port: 5173,
    strictPort: true,
  },
  resolve: {
    // tsconfig.app.json の "paths" ("@/*" -> "./src/*", "@worker/*" -> "./worker/*", "@shared/*" -> "./shared/*") を Vite でも解決する
    tsconfigPaths: true,
  },
  plugins: lazyPlugins(() => [
    // tanstackRouter は react() より前に置く必要がある
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    cloudflare(),
    // ランディングや使い方などを HTML にした landing.html・guide.html などを dist/client に出す (issue #157)。
    // VitePWA の precache に入るよう前に置く
    prerenderPages(),
    // PWA: manifest.webmanifest と Service Worker (sw.js) を dist/client に生成する。
    // cloudflare() がクライアントを dist/client に出力した後 (closeBundle) に動くので、この順で置く
    VitePWA({
      // 新しい SW はユーザーが「リロード」を押すまで待機させる (prompt)。
      // autoUpdate (skipWaiting + clientsClaim) だと旧 precache が即座に消え、開いたままの旧ページの
      // 遅延チャンク読み込みが失敗しうるため。PwaUpdateBanner が needRefresh を見てバナーを出す
      registerType: "prompt",
      // SW の登録は src/routes/(root)/-components/PwaUpdateBanner.tsx の useRegisterSW で行うので、登録スクリプトは注入しない
      injectRegister: null,
      manifest: {
        name: "poi",
        short_name: "poi",
        description: "30 日で消えるメモ帳",
        lang: "ja",
        display: "standalone",
        // 板から開く。この変更前にホーム画面に追加した人は / から開くが、ランディングが板へ転送する (issue #156)
        start_url: "/board",
        scope: "/",
        // index.html の theme-color (light) と同じくページ背景 (白) に合わせる
        theme_color: "#ffffff",
        background_color: "#ffffff",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // 静的アセット (/assets/* など) は precache
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // og.png は SNS のクローラー向け (index.html の og:image)。アプリでは使わないので precache しない
        globIgnores: ["og.png"],
        // ナビゲーションは index.html にフォールバック (SPA)。
        // /api/* (認証付き) と /__scheduled (Cron のローカル実行) は SW を介さずネットワークへ。
        // 拡張子付きのパス (/og.png をブラウザで直接開いたときなど) もフォールバックせずネットワークへ
        navigateFallback: "/index.html",
        // / (末尾が / の URL) は precache の landing.html で返す (ランディングを描いた HTML。issue #157)。
        // precache の照合は navigateFallback より先なので、/ だけがこちらになる。
        // /guide などは Workbox の cleanURLs (既定で有効) が .html を補って precache の guide.html で返す
        directoryIndex: LANDING_HTML,
        navigateFallbackDenylist: [/^\/api\//, /^\/__scheduled/, /\.[a-z0-9]+$/i],
        // runtimeCaching は定義しない: precache 対象外 (= /api/* を含む) は SW がキャッシュせず
        // そのままネットワークに流れる (NetworkOnly 相当)。認証付きレスポンスをキャッシュ事故させないため
      },
    }),
  ]),
});
