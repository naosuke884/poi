import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { LANDING_HTML, prerenderPages } from "./vite-plugins/prerender-pages.ts";

export default defineConfig({
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
  plugins: [
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
  ],
});
