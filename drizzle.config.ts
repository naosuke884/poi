import { defineConfig } from "drizzle-kit";

// マイグレーション SQL の生成専用 (適用は wrangler d1 migrations apply で行う)
export default defineConfig({
  dialect: "sqlite",
  schema: "./worker/db/schema.ts",
  out: "./drizzle",
});
