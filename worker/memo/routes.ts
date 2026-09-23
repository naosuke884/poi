import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { Hono, type ValidationTargets } from "hono";
import { z } from "zod";
import { createDb, type Db } from "../db";
import { memo, userSetting } from "../db/memo";
import { type AppEnv, requireAuth } from "../middleware";
import { planBoardSync } from "./board-sync";
import {
  BOARD_MAX_LENGTH,
  BOARD_MAX_SECTIONS,
  boardLength,
  DAY_MS,
  MEMO_TTL_CHOICES,
  MEMO_TTL_DAYS,
  memoExpiresAt,
  SECTION_SEPARATOR,
} from "./constants";

// 板 (ユーザーごとに 1 枚) をセクションの配列としてやり取りする。
// - セクションは板のテキストを空行 2 つ (SECTION_SEPARATOR = 改行 3 つ) で区切ったもの。中身に改行や空行 1 つは含んでよい
// - id はサーバが発行する。クライアントは「前回保存したセクションの id」を付けて送り返すことで
//   そのセクションの作成日 (= 期限) を引き継ぐ。id が null / 知らない id のものは新しいセクションとして作る
// - 期限は作成時に確定し、内容や並び順を変えても延びない
const sectionSchema = z.object({
  id: z.string().min(1).nullable(),
  content: z
    .string()
    .refine((s) => !s.includes("\r"), "セクションに CR は含められません")
    .refine(
      (s) => !s.includes(SECTION_SEPARATOR),
      "セクションに空行 2 つ (区切り) は含められません",
    ),
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

/** そのユーザーのセクション保持日数 (設定していなければ既定値) */
async function selectTtlDays(db: Db, userId: string): Promise<number> {
  const rows = await db
    .select({ memoTtlDays: userSetting.memoTtlDays })
    .from(userSetting)
    .where(eq(userSetting.userId, userId));
  return rows[0]?.memoTtlDays ?? MEMO_TTL_DAYS;
}

export const boardRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  // 板を取得。ttlDays は「セクションごとに N 日で消えます」の表示用
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const sections = await selectBoard(db, userId, new Date());
    return c.json({ sections, ttlDays: await selectTtlDays(db, userId) });
  })
  // 板を丸ごと置き換える。既存の行との突き合わせ (更新 / 新規 / 削除) は planBoardSync (board-sync.ts)
  .put("/", validate("json", putBoardSchema), async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const now = new Date();
    const { sections } = c.req.valid("json");

    const ttlDays = await selectTtlDays(db, userId);
    const plan = planBoardSync(await selectBoard(db, userId, now), sections);

    const ops: BatchItem<"sqlite">[] = [
      ...plan.updates.map(({ id, content, position }) =>
        db
          .update(memo)
          .set({ content, position })
          .where(and(eq(memo.id, id), eq(memo.userId, userId))),
      ),
      ...plan.inserts.map(({ content, position }) =>
        db.insert(memo).values({
          userId,
          content,
          position,
          createdAt: now,
          updatedAt: now,
          expiresAt: memoExpiresAt(now, ttlDays),
        }),
      ),
    ];
    if (plan.deletes.length > 0) {
      ops.push(db.delete(memo).where(and(eq(memo.userId, userId), inArray(memo.id, plan.deletes))));
    }
    // D1 の batch は 1 トランザクションとして実行される (途中で失敗すれば全部ロールバック)
    if (ops.length > 0) {
      await db.batch(ops as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
    }

    const saved = await selectBoard(db, userId, now);
    return c.json({ sections: saved });
  });

// ユーザー設定 (今はセクションの保持日数のみ)。
// 保持日数を変えたら、いま保存されている全セクションの期限も createdAt + 新しい日数で引き直す
// (短くしたときは、新しい期限を過ぎたセクションが即座に見えなくなり、次の Cron で物理削除される)
const putSettingsSchema = z.object({
  memoTtlDays: z
    .number()
    .int()
    .refine((d) => (MEMO_TTL_CHOICES as readonly number[]).includes(d), {
      message: `保持日数は ${MEMO_TTL_CHOICES.join(", ")} 日から選んでください`,
    }),
});

export const settingsRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/", async (c) => {
    const memoTtlDays = await selectTtlDays(createDb(c.env.DB), c.get("user").id);
    return c.json({ memoTtlDays });
  })
  .put("/", validate("json", putSettingsSchema), async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const now = new Date();
    const { memoTtlDays } = c.req.valid("json");
    // 設定の upsert と期限の引き直しを 1 トランザクションで
    await db.batch([
      db
        .insert(userSetting)
        .values({ userId, memoTtlDays, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: userSetting.userId,
          set: { memoTtlDays, updatedAt: now },
        }),
      db
        .update(memo)
        .set({ expiresAt: sql`${memo.createdAt} + ${memoTtlDays * DAY_MS}` })
        .where(eq(memo.userId, userId)),
    ]);
    return c.json({ memoTtlDays });
  });
