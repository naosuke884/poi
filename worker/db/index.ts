import { drizzle } from "drizzle-orm/d1";
import * as authSchema from "./schema";
import * as memoSchema from "./memo";

// Better Auth 生成分 (schema.ts) + アプリ独自分 (memo.ts) を 1 つにまとめる
export const schema = { ...authSchema, ...memoSchema };

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;
