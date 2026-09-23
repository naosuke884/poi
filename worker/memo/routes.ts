import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { Hono, type ValidationTargets } from "hono";
import { z } from "zod";
import { createDb, type Db } from "../db";
import { board, memo, userSetting } from "../db/memo";
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
// - id を付けるときは、クライアントが知っているその行の createdAt も付ける。知らない id で、今の保持日数では
//   もう期限を過ぎている (別のタブで保持日数を短くして消えた行など) ものは作り直さない (issue #94)
// - 期限は作成時に確定し、内容や並び順を変えても延びない
// - 板には版 (board.revision) があり、保存のたびに変わる。PUT にはクライアントが知っている版を付けてもらい、
//   今の版と違えば (別の端末 / タブが先に保存していれば) 保存せずに 409 Stale を返す。丸ごと置き換えなので、
//   古い内容のまま保存させると、別の場所で足したセクションが消えたり編集が戻ったりする (issue #72)。
//   クライアントは取り直した板に自分の変更を重ねて (src/lib/board-merge.ts) 保存し直す
const sectionSchema = z.object({
  id: z.string().min(1).nullable(),
  // 付けていない (古いクライアント) ときは、知らない id を従来どおり新しいセクションとして作る
  createdAt: z.iso.datetime().optional(),
  content: z
    .string()
    .refine((s) => !s.includes("\r"), "セクションに CR は含められません")
    .refine(
      (s) => !s.includes(SECTION_SEPARATOR),
      "セクションに空行 2 つ (区切り) は含められません",
    ),
});

// userId は保存先としてクライアントが想定している板の持ち主 (アカウント切り替え後の上書き防止。下記)。
// revision はクライアントが最後に取得 / 保存した板の版 (一度も保存されていない板なら null)。
// 版を送らない (undefined) のは版の導入前のクライアント: PWA は更新を「リロード」まで待つので、開いたままの
// 旧ページがしばらく残る。そこからの保存は 400 で失敗させず、これまでどおり版を確かめずに保存する
const putBoardSchema = z
  .object({
    userId: z.string().min(1),
    revision: z.string().min(1).nullable().optional(),
    sections: z.array(sectionSchema).max(BOARD_MAX_SECTIONS),
  })
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

/** 板の版 (一度も保存されていなければ行が無い)。selectBoard と同じ batch に入れて、同じ時点の版を読む */
function selectRevision(db: Db, userId: string) {
  return db.select({ revision: board.revision }).from(board).where(eq(board.userId, userId));
}
type BoardRows = Awaited<ReturnType<typeof selectBoard>>;
type RevisionRows = Awaited<ReturnType<typeof selectRevision>>;

// PUT で行の配列を json_each(?) に展開したときの別名と、その 1 行 (JSON オブジェクト)
const jsonRows = sql.identifier("j");
const jsonRow = sql`${jsonRows}.value`;

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
  // 板を取得。ttlDays は「セクションごとに N 日で消えます」の表示用。
  // userId は板の持ち主 (開いたままのタブが取り直したとき、別タブでアカウントが切り替わっていないか確かめる)
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const [sections, revision] = await db.batch([
      selectBoard(db, userId, new Date()),
      selectRevision(db, userId),
    ]);
    return c.json({
      userId,
      sections,
      revision: revision[0]?.revision ?? null,
      ttlDays: await selectTtlDays(db, userId),
    });
  })
  // 板を丸ごと置き換える。既存の行との突き合わせ (更新 / 新規 / 削除) は planBoardSync (board-sync.ts)
  .put("/", validate("json", putBoardSchema), async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const now = new Date();
    const { userId: expectedUserId, revision: baseRevision, sections } = c.req.valid("json");
    // 切り替え前のアカウントの下書きが、切り替え後の cookie で送られてきた (別タブの自動保存など)。
    // 保存すると切り替え先の板が丸ごと置き換わるので断る (クライアントは保存をやめて読み込み直す)
    if (expectedUserId !== userId) {
      return c.json({ error: "UserMismatch" }, 409);
    }

    const ttlDays = await selectTtlDays(db, userId);
    const [existing, current] = await db.batch([
      selectBoard(db, userId, now),
      selectRevision(db, userId),
    ]);
    // クライアントの知らない保存が間にあった。そのまま置き換えるとその内容を消したり戻したりするので断る
    if (baseRevision !== undefined && (current[0]?.revision ?? null) !== baseRevision) {
      return c.json({ error: "Stale" }, 409);
    }
    // createdAt がこれ以前のセクションは、今の保持日数ではもう期限切れ
    const expiredCreatedAt = new Date(now.getTime() - ttlDays * DAY_MS);
    const plan = planBoardSync(existing, sections, expiredCreatedAt);

    // 版を新しい値にし、以降の書き込みは「版がその値になっている (= この保存が版を進めた)」ときだけ行う。
    // 上で版を確かめてからこの batch までの間に別の保存が割り込んでいれば、版の更新が当たらず何も書かれない
    const revision = crypto.randomUUID();
    const committed = sql`exists (select 1 from ${board} where ${board.userId} = ${userId} and ${board.revision} = ${revision})`;

    // セクションは最大 BOARD_MAX_SECTIONS (1,000) 個あるので、行ごとに文を分けたり id を 1 つずつ
    // バインドしたりすると D1 の上限 (1 文あたりのバインド数 100、1 回の呼び出しあたりのクエリ数
    // 50 (Free) / 1,000 (Paid)) に当たる。行は JSON 配列 1 つにまとめてバインドし、json_each で
    // 展開して、更新 / 作成 / 削除をそれぞれ 1 文で済ませる (文の数もバインド数もセクション数によらない)
    const ops: BatchItem<"sqlite">[] = [
      baseRevision === undefined
        ? // 版の導入前のクライアント (上記): 確かめずに進める (新しいクライアントには版が変わったことが伝わる)
          db
            .insert(board)
            .values({ userId, revision })
            .onConflictDoUpdate({ target: board.userId, set: { revision } })
        : baseRevision === null
          ? db.insert(board).values({ userId, revision }).onConflictDoNothing()
          : db
              .update(board)
              .set({ revision })
              .where(and(eq(board.userId, userId), eq(board.revision, baseRevision))),
    ];
    if (plan.updates.length > 0) {
      ops.push(
        db
          .update(memo)
          .set({
            content: sql`${jsonRow}->>'content'`,
            position: sql`${jsonRow}->>'position'`,
          })
          .from(sql`json_each(${JSON.stringify(plan.updates)}) as ${jsonRows}`)
          .where(and(eq(memo.id, sql`${jsonRow}->>'id'`), eq(memo.userId, userId), committed)),
      );
    }
    if (plan.inserts.length > 0) {
      // insert ... select は、select する列をテーブル定義と同じ順に並べる (drizzle の制約)
      ops.push(
        db.insert(memo).select((qb) =>
          qb
            .select({
              id: sql<string>`${jsonRow}->>'id'`.as("id"),
              userId: sql<string>`${userId}`.as("user_id"),
              content: sql<string>`${jsonRow}->>'content'`.as("content"),
              position: sql<number>`${jsonRow}->>'position'`.as("position"),
              createdAt: sql<number>`${now.getTime()}`.as("created_at"),
              updatedAt: sql<number>`${now.getTime()}`.as("updated_at"),
              expiresAt: sql<number>`${memoExpiresAt(now, ttlDays).getTime()}`.as("expires_at"),
            })
            .from(sql`json_each(${JSON.stringify(plan.inserts)}) as ${jsonRows}`)
            .where(committed),
        ),
      );
    }
    if (plan.deletes.length > 0) {
      ops.push(
        db
          .delete(memo)
          .where(
            and(
              eq(memo.userId, userId),
              inArray(memo.id, sql`(select value from json_each(${JSON.stringify(plan.deletes)}))`),
              committed,
            ),
          ),
      );
    }
    // D1 の batch は 1 トランザクションとして実行される (途中で失敗すれば全部ロールバック)。
    // 保存後の行の取り直しも同じ batch に入れ、間に別の PUT が割り込んだ内容を返さないようにする
    ops.push(selectBoard(db, userId, now), selectRevision(db, userId));
    const results = await db.batch(ops as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
    const rows = results[results.length - 2] as BoardRows;
    const after = results[results.length - 1] as RevisionRows;
    if (after[0]?.revision !== revision) {
      // 割り込んだ別の保存が先に版を進めた (この保存は何も書いていない)
      return c.json({ error: "Stale" }, 409);
    }

    // 送られた順に、各セクションの保存後の行を返す (クライアントは添字で対応付ける)。
    // 期限切れとして作らなかったセクションは null
    const byId = new Map(rows.map((row) => [row.id, row]));
    const saved = plan.ids.map((id) => (id === null ? null : byId.get(id)));
    if (saved.some((row) => row === undefined)) {
      // 突き合わせた既存の行が、読んでから書くまでの間に消された (期限切れの物理削除。別の保存なら
      // 上の版の確認で断っている)。保存自体は済んで版も進んだので、取り直してもらう
      return c.json({ error: "Stale" }, 409);
    }
    return c.json({ sections: saved as Exclude<(typeof saved)[number], undefined>[], revision });
  });

// ユーザー設定 (今はセクションの保持日数のみ)。
// 保持日数を変えたら、いま見えている (期限切れでない) 全セクションの期限も createdAt + 新しい日数で引き直す
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
        // 期限切れで Cron の物理削除待ちの行は引き直さない (延ばすと復活してしまう)
        .where(visibleSections(userId, now)),
    ]);
    return c.json({ memoTtlDays });
  });
