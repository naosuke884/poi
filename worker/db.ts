import { drizzle } from "drizzle-orm/d1";
import * as appSchema from "./app/schema";
import * as authSchema from "./auth/schema";

// Better Auth 生成分 (auth/schema.ts) + アプリ独自分 (app/schema.ts) を 1 つにまとめる
export const schema = { ...authSchema, ...appSchema };

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;
