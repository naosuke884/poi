import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: {
    // tsconfig.app.json の "paths" ("@/*" -> "./src/*") を Vite でも解決する
    tsconfigPaths: true,
  },
  plugins: [
    // tanstackRouter は react() より前に置く必要がある
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    cloudflare(),
    // PWA: manifest.webmanifest と Service Worker (sw.js) を dist/client に生成する。
    // cloudflare() がクライアントを dist/client に出力した後 (closeBundle) に動くので、この順で置く
    VitePWA({
      // 新しい SW はユーザーが「リロード」を押すまで待機させる (prompt)。
      // autoUpdate (skipWaiting + clientsClaim) だと旧 precache が即座に消え、開いたままの旧ページの
      // 遅延チャンク読み込みが失敗しうるため。PwaUpdateBanner が needRefresh を見てバナーを出す
      registerType: "prompt",
      // SW の登録は src/components/PwaUpdateBanner.tsx の useRegisterSW で行うので、登録スクリプトは注入しない
      injectRegister: null,
      manifest: {
        name: "poi",
        short_name: "poi",
        description: "1 ヶ月で消えるメモ",
        lang: "ja",
        display: "standalone",
        start_url: "/",
        scope: "/",
        // index.html の theme-color (light) と同じくページ背景 (白) に合わせる
        theme_color: "#ffffff",
        background_color: "#ffffff",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
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
        navigateFallbackDenylist: [/^\/api\//, /^\/__scheduled/, /\.[a-z0-9]+$/i],
        // runtimeCaching は定義しない: precache 対象外 (= /api/* を含む) は SW がキャッシュせず
        // そのままネットワークに流れる (NetworkOnly 相当)。認証付きレスポンスをキャッシュ事故させないため
      },
    }),
  ],
});
