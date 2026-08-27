import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

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
  ],
});
