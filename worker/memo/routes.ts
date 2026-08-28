import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { Hono, type ValidationTargets } from "hono";
import { z } from "zod";
import { createDb, type Db } from "../db";
import { memo } from "../db/memo";
import { requireAuth, type AppEnv } from "../middleware";
import { BOARD_MAX_LENGTH, BOARD_MAX_LINES, memoExpiresAt } from "./constants";

// 板 (ユーザーごとに 1 枚) を行の配列としてやり取りする。
// - id はサーバが発行する。クライアントは「前回保存した行の id」を付けて送り返すことで
//   その行の作成日 (= 期限) を引き継ぐ。id が null / 知らない id の行は新しい行として作る
// - 期限は作成時に確定し、内容や並び順を変えても延びない
const lineSchema = z.object({
  id: z.string().min(1).nullable(),
  content: z.string().regex(/^[^\r\n]*$/, "行に改行は含められません"),
});

const putBoardSchema = z
  .object({ lines: z.array(lineSchema).max(BOARD_MAX_LINES) })
  .refine((v) => boardLength(v.lines) <= BOARD_MAX_LENGTH, {
    message: `板全体で ${BOARD_MAX_LENGTH} 文字までです`,
  });

/** 板全体の文字数 (行を改行で連結したときの長さ) */
function boardLength(lines: { content: string }[]): number {
  return lines.reduce((n, l) => n + l.content.length, 0) + Math.max(0, lines.length - 1);
}

// バリデーション失敗時は他のエラーレスポンスと同じ { error } 形式に揃える。
// フックを事前に型付けした定数にすると hono の RPC 型推論が {} に潰れるため、
// スキーマごとに推論されるよう小さなラッパー関数にしている。
function validate<T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Bad Request", issues: result.error.issues }, 400);
    }
  });
}

// 「自分の行」かつ「未期限切れ」。期限切れの行は Cron が消すまで DB に残るが、見せない
function visibleLines(userId: string, now: Date) {
  return and(eq(memo.userId, userId), gt(memo.expiresAt, now));
}

/** 板の全行を並び順で返す。同じ position が並んだときは作成順 */
function selectBoard(db: Db, userId: string, now: Date) {
  return db
    .select()
    .from(memo)
    .where(visibleLines(userId, now))
    .orderBy(asc(memo.position), asc(memo.createdAt));
}

export const boardRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  // 板を取得
  .get("/", async (c) => {
    const lines = await selectBoard(createDb(c.env.DB), c.get("user")!.id, new Date());
    return c.json({ lines });
  })
  // 板を丸ごと置き換える。
  // 送られた行のうち id が既存の行と一致するものは内容と並び順だけ更新し (createdAt / expiresAt は維持)、
  // それ以外は新規作成、送られてこなかった既存の行は削除する。
  .put("/", validate("json", putBoardSchema), async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user")!.id;
    const now = new Date();
    const { lines } = c.req.valid("json");

    const existing = await selectBoard(db, userId, now);
    const byId = new Map(existing.map((row) => [row.id, row]));

    const ops: BatchItem<"sqlite">[] = [];
    const kept = new Set<string>();
    lines.forEach((line, position) => {
      const row = line.id !== null && !kept.has(line.id) ? byId.get(line.id) : undefined;
      if (row) {
        kept.add(row.id);
        // 変わっていない行は触らない (updatedAt も進めない)
        if (row.content === line.content && row.position === position) return;
        ops.push(
          db
            .update(memo)
            .set({ content: line.content, position })
            .where(and(eq(memo.id, row.id), eq(memo.userId, userId))),
        );
      } else {
        ops.push(
          db.insert(memo).values({
            userId,
            content: line.content,
            position,
            createdAt: now,
            updatedAt: now,
            expiresAt: memoExpiresAt(now),
          }),
        );
      }
    });
    const removed = existing.filter((row) => !kept.has(row.id)).map((row) => row.id);
    if (removed.length > 0) {
      ops.push(db.delete(memo).where(and(eq(memo.userId, userId), inArray(memo.id, removed))));
    }
    // D1 の batch は 1 トランザクションとして実行される (途中で失敗すれば全部ロールバック)
    if (ops.length > 0) {
      await db.batch(ops as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
    }

    const saved = await selectBoard(db, userId, now);
    return c.json({ lines: saved });
  });

export type BoardRoutes = typeof boardRoutes;
