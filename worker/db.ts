import { drizzle } from "drizzle-orm/d1";
import * as authSchema from "./auth/schema";
import * as boardSchema from "./board/schema";

// Better Auth 生成分 (auth/schema.ts) + 板まわり (board/schema.ts) を 1 つにまとめる
export const schema = { ...authSchema, ...boardSchema };

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;
