import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDb } from "../db";
import { memo } from "../db/memo";
import { requireAuth, type AppEnv } from "../middleware";
import { MEMO_CONTENT_MAX_LENGTH, MEMO_TITLE_MAX_LENGTH, memoExpiresAt } from "./constants";

// title は省略可 (null で「無題」)。content は 1〜MEMO_CONTENT_MAX_LENGTH 文字。
const titleSchema = z.string().max(MEMO_TITLE_MAX_LENGTH).nullable();
const contentSchema = z.string().min(1).max(MEMO_CONTENT_MAX_LENGTH);

const createMemoSchema = z.object({
  title: titleSchema.optional(),
  content: contentSchema,
});

// PATCH で更新できるのは title / content だけ。expiresAt はスキーマに含めず、
// 送られてきても無視する (延命させない)。
const updateMemoSchema = z
  .object({
    title: titleSchema.optional(),
    content: contentSchema.optional(),
  })
  .refine((v) => v.title !== undefined || v.content !== undefined, {
    message: "title または content のいずれかが必要です",
  });

const paramSchema = z.object({ id: z.string().min(1) });

// バリデーション失敗時は他のエラーレスポンスと同じ { error } 形式に揃える
const onValidationError: Parameters<typeof zValidator>[2] = (result, c) => {
  if (!result.success) {
    return c.json({ error: "Bad Request", issues: result.error.issues }, 400);
  }
};

// 「自分のメモ」かつ「未期限切れ」の条件。
// 他人のメモ・期限切れメモはどちらも「存在しない」扱い (404) にして、
// ID の有無やメモの存在を外部に漏らさない。
function visibleMemo(userId: string, id?: string) {
  const now = new Date();
  return and(
    eq(memo.userId, userId),
    gt(memo.expiresAt, now),
    id === undefined ? undefined : eq(memo.id, id),
  );
}

export const memoRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  // 自分のメモ一覧 (updatedAt 降順、未期限切れのみ)
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const memos = await db
      .select()
      .from(memo)
      .where(visibleMemo(c.get("user")!.id))
      .orderBy(desc(memo.updatedAt));
    return c.json({ memos });
  })
  // 作成。expiresAt = createdAt + 30 日 をサーバ側で確定する (クライアントからは指定不可)
  .post("/", zValidator("json", createMemoSchema, onValidationError), async (c) => {
    const db = createDb(c.env.DB);
    const { title, content } = c.req.valid("json");
    const now = new Date();
    const created = await db
      .insert(memo)
      .values({
        userId: c.get("user")!.id,
        title: title ?? null,
        content,
        createdAt: now,
        updatedAt: now,
        expiresAt: memoExpiresAt(now),
      })
      .returning()
      .get();
    return c.json({ memo: created }, 201);
  })
  // 1 件取得
  .get("/:id", zValidator("param", paramSchema, onValidationError), async (c) => {
    const db = createDb(c.env.DB);
    const { id } = c.req.valid("param");
    const found = await db
      .select()
      .from(memo)
      .where(visibleMemo(c.get("user")!.id, id))
      .get();
    if (!found) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json({ memo: found });
  })
  // title / content 更新。updatedAt は $onUpdate で自動更新、expiresAt は変更しない
  .patch(
    "/:id",
    zValidator("param", paramSchema, onValidationError),
    zValidator("json", updateMemoSchema, onValidationError),
    async (c) => {
      const db = createDb(c.env.DB);
      const { id } = c.req.valid("param");
      const { title, content } = c.req.valid("json");
      const updated = await db
        .update(memo)
        .set({
          ...(title !== undefined && { title }),
          ...(content !== undefined && { content }),
        })
        .where(visibleMemo(c.get("user")!.id, id))
        .returning()
        .get();
      if (!updated) {
        return c.json({ error: "Not Found" }, 404);
      }
      return c.json({ memo: updated });
    },
  )
  // 削除
  .delete("/:id", zValidator("param", paramSchema, onValidationError), async (c) => {
    const db = createDb(c.env.DB);
    const { id } = c.req.valid("param");
    const deleted = await db
      .delete(memo)
      .where(visibleMemo(c.get("user")!.id, id))
      .returning({ id: memo.id })
      .get();
    if (!deleted) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json({ id: deleted.id });
  });

export type MemoRoutes = typeof memoRoutes;
