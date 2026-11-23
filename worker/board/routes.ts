import {
  BOARD_MAX_LENGTH,
  BOARD_MAX_SECTIONS,
  boardLength,
  DAY_MS,
  MEMO_TTL_DAYS,
  memoExpiresAt,
  normalizeTag,
  TAG_MAX_REGISTERED,
  type TagIcon,
} from "@shared/constants";
import { and, asc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { Hono } from "hono";
import { z } from "zod";

import { requireAuth } from "../auth/middleware";
import { createDb, type Db } from "../db";
import type { AppEnv } from "../types";
import { validate } from "../validate";
import { dropUnregisteredTags, planBoardSync } from "./board-sync";
import { board, memo, tag } from "./schema";
import { chooseTagIcon } from "./tag-icon";

// 板 (ユーザーごとに 1 枚) をセクションの配列としてやり取りする。
// - セクションは自由なテキスト。中身に改行や空行 (いくつ続いても) を含んでよい
// - id はサーバが発行する。クライアントは「前回保存したセクションの id」を付けて送り返すことで
//   そのセクションの作成日 (= 期限) を引き継ぐ。id が null / 知らない id のものは新しいセクションとして作る
// - id を付けるときは、クライアントが知っているその行の createdAt も付ける。知らない id で、createdAt から
//   保持日数 (MEMO_TTL_DAYS) を過ぎているものは作り直さない (issue #94)
// - 期限は作成時に確定し、内容や並び順、タグを変えても延びない
// - セクションには登録済みのタグ (/api/tags) を 1 つ、その id (tagId) で付けられる。タグだけの変更も保存する。
//   登録されていない id (別の場所で登録を消されたタグ) が送られてきたら、タグなしにして保存する
// - 板には版 (board.revision) があり、保存のたびに変わる。PUT にはクライアントが知っている版を付けてもらい、
//   今の版と違えば (別の端末 / タブが先に保存していれば) 保存せずに 409 Stale を返す。丸ごと置き換えなので、
//   古い内容のまま保存させると、別の場所で足したセクションが消えたり編集が戻ったりする (issue #72)。
//   クライアントは取り直した板に自分の変更を重ねて (src/routes/board/-lib/sections/board-merge.ts) 保存し直す
/** タグの名前。normalizeTag を通した形 (前後の空白や先頭の # が無く、長すぎない) だけを受け付ける */
const tagNameSchema = z
  .string()
  .refine((name) => normalizeTag(name) === name, "タグの形が正しくありません");

const sectionSchema = z.object({
  id: z.string().min(1).nullable(),
  // 付けていない (古いクライアント) ときは、知らない id を従来どおり新しいセクションとして作る
  createdAt: z.iso.datetime().optional(),
  content: z.string().refine((s) => !s.includes("\r"), "セクションに CR は含められません"),
  // 項目ごと無い (タグの導入前から開いたままのページ) ときは、今のタグを変えない (board-sync.ts の IncomingSection)
  tagId: z.string().min(1).nullable().optional(),
});

// userId は保存先としてクライアントが想定している板の持ち主 (アカウント切り替え後の上書き防止。下記)。
// revision はクライアントが最後に取得 / 保存した板の版 (一度も保存されていない板なら null)。必須。
// 版を送らないのは版の導入前のページ (開いたままの PWA) だけだが、確かめずに保存させると別の場所の保存を
// 消してしまうので 400 で断る (そのページは保存エラーを出し、リロードすれば新しいページで保存し直せる。HAY-43)
const putBoardSchema = z
  .object({
    userId: z.string().min(1),
    revision: z.string().min(1).nullable(),
    sections: z.array(sectionSchema).max(BOARD_MAX_SECTIONS),
  })
  .refine((v) => boardLength(v.sections) <= BOARD_MAX_LENGTH, {
    message: `板全体で ${BOARD_MAX_LENGTH} 文字までです`,
  });

// 「自分のセクション」かつ「未期限切れ」。期限切れの行は Cron が中身を消した後もしばらく DB に残る (sweep.ts) が、見せない
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
/**
 * 送られた id のうち、期限切れの自分の行のもの。期限切れの行は Cron が中身を消してしばらく残す (sweep.ts) ので、
 * createdAt の判定では見分けられない行 (保持日数を短く設定できた頃の、早く期限が来た行) も、期限切れの id だとわかる (HAY-60)。
 * 期限切れの行を全部読むと、保持日数ぶん溜まった行を保存のたびに読むので、送られた id に絞る
 */
function selectExpiredIds(db: Db, userId: string, now: Date, sections: { id: string | null }[]) {
  const ids = sections.flatMap((section) => (section.id === null ? [] : [section.id]));
  return db
    .select({ id: memo.id })
    .from(memo)
    .where(
      and(
        eq(memo.userId, userId),
        lte(memo.expiresAt, now),
        inArray(memo.id, sql`(select value from json_each(${JSON.stringify(ids)}))`),
      ),
    );
}
/** 登録済みのタグ (登録した順)。API はこの形の配列をそのまま返す */
function selectTags(db: Db, userId: string) {
  return db
    .select({ id: tag.id, name: tag.name, icon: tag.icon })
    .from(tag)
    .where(eq(tag.userId, userId))
    .orderBy(asc(tag.createdAt), asc(tag.name));
}

/** ユーザーの登録済みのタグに name の名前のものがあるか (書き込みの条件に使う SQL) */
function tagNamed(userId: string, name: string) {
  return sql`exists (select 1 from ${tag} where ${tag.userId} = ${userId} and ${tag.name} = ${name})`;
}

type BoardRows = Awaited<ReturnType<typeof selectBoard>>;
type RevisionRows = Awaited<ReturnType<typeof selectRevision>>;

/**
 * writes を書いてから、同じ batch (D1 では 1 トランザクション) で板と版を読み直す。
 * drizzle の batch の結果は渡した順の tuple だが、書き込みの数が保存ごとに違うので末尾の 2 つの型は推論されない
 * (キャストはここだけにする)
 */
async function writeThenSelectBoard(
  db: Db,
  userId: string,
  now: Date,
  writes: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
): Promise<{ rows: BoardRows; revision: RevisionRows }> {
  const results = await db.batch([
    ...writes,
    selectBoard(db, userId, now),
    selectRevision(db, userId),
  ]);
  const [rows, revision] = results.slice(-2) as [BoardRows, RevisionRows];
  return { rows, revision };
}

// PUT で行の配列を json_each(?) に展開したときの別名と、その 1 行 (JSON オブジェクト)
const jsonRows = sql.identifier("j");
const jsonRow = sql`${jsonRows}.value`;

/**
 * 保存する行の tag_id: 送られた id (JSON の 1 行の tagId) が今もこのユーザーの登録済みのタグなら、その id。
 * 無ければ null。前もって読んだ登録 (dropUnregisteredTags) との間に登録が消されても、消えたタグの id を書かない。
 * 前もって読んだ登録で外すのもやめないのは、突き合わせ (planBoardSync) が消えたタグの id を「タグの変更」と見て、
 * 何も変わらない行を書き直す (updatedAt を進める) ため
 */
const registeredTagId = (userId: string) =>
  sql<
    string | null
  >`(select ${tag.id} from ${tag} where ${tag.userId} = ${userId} and ${tag.id} = ${jsonRow}->>'tagId')`;

export const boardRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  // 板を取得。tags は登録済みのタグ (タグを選ぶ欄に出す。板と一緒に返して、取得を 1 回で済ませる)。
  // userId は板の持ち主 (開いたままのタブが取り直したとき、別タブでアカウントが切り替わっていないか確かめる)
  .get("/", async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const [sections, revision, tags] = await db.batch([
      selectBoard(db, userId, new Date()),
      selectRevision(db, userId),
      selectTags(db, userId),
    ]);
    return c.json({ userId, sections, revision: revision[0]?.revision ?? null, tags });
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

    const [existing, current, expired, registered] = await db.batch([
      selectBoard(db, userId, now),
      selectRevision(db, userId),
      selectExpiredIds(db, userId, now, sections),
      db.select({ id: tag.id }).from(tag).where(eq(tag.userId, userId)),
    ]);
    // クライアントの知らない保存が間にあった。そのまま置き換えるとその内容を消したり戻したりするので断る
    if ((current[0]?.revision ?? null) !== baseRevision) {
      return c.json({ error: "Stale" }, 409);
    }
    // createdAt がこれ以前のセクションは、もう期限切れ
    const expiredCreatedAt = new Date(now.getTime() - MEMO_TTL_DAYS * DAY_MS);
    const plan = planBoardSync(
      existing,
      dropUnregisteredTags(sections, new Set(registered.map((row) => row.id))),
      expiredCreatedAt,
      new Set(expired.map((row) => row.id)),
    );

    // 版を新しい値にし、以降の書き込みは「版がその値になっている (= この保存が版を進めた)」ときだけ行う。
    // 上で版を確かめてからこの batch までの間に別の保存が割り込んでいれば、版の更新が当たらず何も書かれない
    const revision = crypto.randomUUID();
    const committed = sql`exists (select 1 from ${board} where ${board.userId} = ${userId} and ${board.revision} = ${revision})`;

    // セクションは最大 BOARD_MAX_SECTIONS (1,000) 個あるので、行ごとに文を分けたり id を 1 つずつ
    // バインドしたりすると D1 の上限 (1 文あたりのバインド数 100、1 回の呼び出しあたりのクエリ数
    // 50 (Free) / 1,000 (Paid)) に当たる。行は JSON 配列 1 つにまとめてバインドし、json_each で
    // 展開して、更新 / 作成 / 削除をそれぞれ 1 文で済ませる (文の数もバインド数もセクション数によらない)
    const ops: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
      baseRevision === null
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
            tagId: registeredTagId(userId),
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
              expiresAt: sql<number>`${memoExpiresAt(now).getTime()}`.as("expires_at"),
              tagId: registeredTagId(userId).as("tag_id"),
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
    const { rows, revision: after } = await writeThenSelectBoard(db, userId, now, ops);
    if (after[0]?.revision !== revision) {
      // 割り込んだ別の保存が先に版を進めた (この保存は何も書いていない)
      return c.json({ error: "Stale" }, 409);
    }

    // 送られた順に、各セクションの保存後の行を返す (クライアントは添字で対応付ける)。
    // 期限切れとして作らなかったセクションは null
    const byId = new Map(rows.map((row) => [row.id, row]));
    const saved: (BoardRows[number] | null)[] = [];
    for (const id of plan.ids) {
      const row = id === null ? null : byId.get(id);
      if (row === undefined) {
        // 突き合わせた既存の行が、読んでから書くまでの間に見えなくなった (期限切れ。別の保存なら
        // 上の版の確認で断っている)。保存自体は済んで版も進んだので、取り直してもらう
        return c.json({ error: "Stale" }, 409);
      }
      saved.push(row);
    }
    return c.json({ sections: saved, revision });
  });

// 登録済みのタグ。セクションに付けるタグはここから選ぶ (付けるのは PUT /api/board の各セクションの tagId)。
// どの操作も、変えた後の一覧 (登録した順の { id, name, icon }) を返す
const tagBodySchema = z.object({ name: tagNameSchema });
const tagIdSchema = z.object({ id: z.string().min(1) });
const tagRenameSchema = tagIdSchema.extend(tagBodySchema.shape);

export const tagRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/", async (c) => {
    return c.json({ tags: await selectTags(createDb(c.env.DB), c.get("user").id) });
  })
  // 登録する。もう同じ名前で登録されていれば何もしない (同じタグを別の端末でも登録したとき、失敗にしない)。
  // 作ったタグの id は、返す一覧から名前で探してもらう
  .post("/", validate("json", tagBodySchema), async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { name } = c.req.valid("json");
    const now = new Date();
    // アイコンを選ぶ (外の有料の API を数秒まで待つ) 前に、登録が要るかを確かめる。確かめずに選ぶと、
    // もうあるタグや上限を超えた登録のたびに、使わないアイコンのために払って待たせる
    const before = await selectTags(db, userId);
    if (before.some((t) => t.name === name)) return c.json({ tags: before });
    if (before.length >= TAG_MAX_REGISTERED) return c.json({ error: "TooManyTags" }, 409);
    const icon = await chooseTagIcon(name, c.env.TYPESAFE_API_KEY);
    // 上限と名前の重なりの確認は insert と同じ文でもう一度行う (上の確認だけだと、同時に来た登録が両方通って上限を超える)。
    // insert ... select は、select する列をテーブル定義と同じ順に並べる (drizzle の制約)
    const [, tags] = await db.batch([
      db.insert(tag).select((qb) =>
        qb
          .select({
            id: sql<string>`${crypto.randomUUID()}`.as("id"),
            userId: sql<string>`${userId}`.as("user_id"),
            name: sql<string>`${name}`.as("name"),
            icon: sql<TagIcon>`${icon}`.as("icon"),
            createdAt: sql<number>`${now.getTime()}`.as("created_at"),
          })
          .from(sql`(select 1)`)
          .where(
            sql`(select count(*) from ${tag} where ${tag.userId} = ${userId}) < ${TAG_MAX_REGISTERED}
              and not ${tagNamed(userId, name)}`,
          ),
      ),
      selectTags(db, userId),
    ]);
    if (!tags.some((t) => t.name === name)) return c.json({ error: "TooManyTags" }, 409);
    return c.json({ tags });
  })
  // 登録を消し、そのタグを付けていたセクションからも外す (本文は変えない)。もう無ければ何もしない。
  // 板の版は進めない: 開いたままの別の画面は、一覧に無くなった id のタグを「タグなし」として見せ、次の保存では
  // サーバが外す (PUT の registeredTagId)。進めると、その画面の次の保存が断られて取り直すことになり、
  // 取り直した板で外れたタグが「別の場所での変更」に見え、その画面で消したばかりのセクションが戻ってくる
  .delete("/", validate("json", tagIdSchema), async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { id } = c.req.valid("json");
    const [, , tags] = await db.batch([
      db
        .update(memo)
        .set({ tagId: null })
        .where(and(eq(memo.userId, userId), eq(memo.tagId, id))),
      db.delete(tag).where(and(eq(tag.userId, userId), eq(tag.id, id))),
      selectTags(db, userId),
    ]);
    return c.json({ tags });
  })
  // 名前を変える。アイコンは名前から選んだものなので、新しい名前で選び直す (id と登録した順は変えない)。
  // セクションは id で指しているので書き換えない (板の版も進めない)。
  // 新しい名前のタグがもうあれば 409 TagExists で断り、何も変えない (同じ名前のタグが 2 つになるため)。
  // 変えるタグが無ければ (別の場所で登録を消された) 404 TagNotFound で断る
  .patch("/", validate("json", tagRenameSchema), async (c) => {
    const db = createDb(c.env.DB);
    const userId = c.get("user").id;
    const { id, name } = c.req.valid("json");
    // アイコンを選ぶ前に、変えられるかを確かめる (理由は登録と同じ)
    const before = await selectTags(db, userId);
    const current = before.find((t) => t.id === id);
    if (!current) return c.json({ error: "TagNotFound" }, 404);
    if (current.name === name) return c.json({ tags: before });
    if (before.some((t) => t.name === name)) return c.json({ error: "TagExists" }, 409);
    const icon = await chooseTagIcon(name, c.env.TYPESAFE_API_KEY);
    // 上の確認からこの batch までに同じ名前のタグが作られていたら変えない (一意のインデックスの違反で失敗させない)
    const [, tags] = await db.batch([
      db
        .update(tag)
        .set({ name, icon })
        .where(and(eq(tag.userId, userId), eq(tag.id, id), sql`not ${tagNamed(userId, name)}`)),
      selectTags(db, userId),
    ]);
    const renamed = tags.find((t) => t.id === id);
    if (!renamed) return c.json({ error: "TagNotFound" }, 404);
    if (renamed.name !== name) return c.json({ error: "TagExists" }, 409);
    return c.json({ tags });
  });
