import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";

/**
 * zod で入力を確かめる。失敗時は他のエラーレスポンスと同じ { error } 形式 (と zod の issues) で 400 を返す。
 * フックを事前に型付けした定数にすると hono の RPC 型推論が {} に潰れるため、
 * スキーマごとに推論されるよう小さなラッパー関数にしている。
 * issues には入力の値そのものは入らない (どの項目がどの規則に外れたかだけ) ので、メモの中身は返さない
 */
export function validate<T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Bad Request", issues: result.error.issues }, 400);
    }
  });
}
