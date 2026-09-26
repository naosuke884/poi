import { defineConfig } from "drizzle-kit";

// マイグレーション SQL の生成専用 (適用は wrangler d1 migrations apply で行う)
// スキーマが import する @shared/* は、ルートの tsconfig.json の paths で解決する (drizzle-kit はルートの tsconfig.json しか読まない)
export default defineConfig({
  dialect: "sqlite",
  schema: ["./worker/auth/schema.ts", "./worker/board/schema.ts"],
  out: "./drizzle",
});
