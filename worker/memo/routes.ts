import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { Hono, type ValidationTargets } from "hono";
import { z } from "zod";
import { createDb, type Db } from "../db";
import { memo } from "../db/memo";
import { requireAuth, type AppEnv } from "../middleware";
import {
  BOARD_MAX_LENGTH,
  BOARD_MAX_SECTIONS,
  SECTION_SEPARATOR,
  boardLength,
  memoExpiresAt,
} from "./constants";

// 板 (ユーザーごとに 1 枚) をセクションの配列としてやり取りする。
// - セクションは板のテキストを空行 (SECTION_SEPARATOR) で区切ったもの。中身に単独の改行は含んでよい
// - id はサーバが発行する。クライアントは「前回保存したセクションの id」を付けて送り返すことで
//   そのセクションの作成日 (= 期限) を引き継ぐ。id が null / 知らない id のものは新しいセクションとして作る
// - 期限は作成時に確定し、内容や並び順を変えても延びない
const sectionSchema = z.object({
  id: z.string().min(1).nullable(),
  content: z
    .string()
    .refine((s) => !s.includes("\r"), "セクションに CR は含められません")
    .refine((s) => !s.includes(SECTION_SEPARATOR), "セクションに空行 (区切り) は含められません"),
});

const putBoardSchema = z
  .object({ sections: z.array(sectionSchema).max(BOARD_MAX_SECTIONS) })
  .refine((v) => boardLength(v.sections) <= BOARD_MAX_LENGTH, {
    message: `板全体で ${BOARD_MAX_LENGTH} 文字までです`,
  });

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

// 「自分のセクション」かつ「未期限切れ」。期限切れのものは Cron が消すまで DB に残るが、見せない
function visibleSections(userId: string, now: Date) {
  return and(eq(memo.userId, userId), gt(memo.expiresAt, now));
}

/** 板の全セクションを並び順で返す。同じ position が並んだときは作成順 */
function selectBoard(db: Db, userId: string, now: Date) {
  return db
    .select()
    .from(memo)
    .where(visibleSections(userId, now))
    .orderBy(asc(memo.position), asc(memo.createdAt));
}

export const boardRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  // 板を取得
  .get("/", async (c) => {
    const sections = await selectBoard(createDb(c.env.DB), c.get("user")!.id, new Date());
    return c.json({ sections });
  })
  // 板を丸ごと置き換える。
  // 送られたセクションのうち id が既存のものと一致すれば内容と並び順だけ更新し (createdAt / expiresAt は維持)、
  // それ以外は新規作成、送られてこなかった既存のセクションは削除する。
  .put("/", validate("json", putBoardSchema), async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user")!.id;
    const now = new Date();
    const { sections } = c.req.valid("json");

    const existing = await selectBoard(db, userId, now);
    const byId = new Map(existing.map((row) => [row.id, row]));

    const ops: BatchItem<"sqlite">[] = [];
    const kept = new Set<string>();
    sections.forEach((section, position) => {
      const row = section.id !== null && !kept.has(section.id) ? byId.get(section.id) : undefined;
      if (row) {
        kept.add(row.id);
        // 変わっていないセクションは触らない (updatedAt も進めない)
        if (row.content === section.content && row.position === position) return;
        ops.push(
          db
            .update(memo)
            .set({ content: section.content, position })
            .where(and(eq(memo.id, row.id), eq(memo.userId, userId))),
        );
      } else {
        ops.push(
          db.insert(memo).values({
            userId,
            content: section.content,
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
    return c.json({ sections: saved });
  });

export type BoardRoutes = typeof boardRoutes;
