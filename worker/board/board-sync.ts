// PUT /api/board (板の丸ごと置き換え) で、送られてきたセクションを既存の行とどう突き合わせるかを決める。
// DB に触らない純粋関数にして、ルート (routes.ts) はこの結果を batch にするだけにする

/** 既存の行のうち突き合わせに使う部分 */
export type ExistingSection = {
  id: string;
  content: string;
  position: number;
  tagId: string | null;
};

/**
 * 送られてきた 1 セクション。id は「前回保存したセクション」を引き継ぐときだけ付く。
 * createdAt は送り手が知っているその行の作成日時 (ISO 文字列。id があるときだけ付く)。
 * tagId は付けるタグの id (null は「タグなし」)。項目ごと無いのは、タグを知らない送り手 (タグの導入前から開いたままの
 * ページ) で、そのときは今のタグを変えない: 無いものを「タグなし」として扱うと、そのページの自動保存のたびに
 * 全部のタグが消える
 */
export type IncomingSection = {
  id: string | null;
  content: string;
  createdAt?: string;
  tagId?: string | null;
};

/** 保存する 1 行 */
type SectionWrite = { id: string; content: string; position: number; tagId: string | null };

export type BoardSyncPlan = {
  /** 内容・並び順・タグのどれかが変わった既存の行 (createdAt / expiresAt は維持する) */
  updates: SectionWrite[];
  /** 新しく作る行 (id が null / 知らない id / 同じ id の 2 つ目以降)。id はここで発行する */
  inserts: SectionWrite[];
  /** 送られてこなかった既存の行 */
  deletes: string[];
  /**
   * 送られた順の、保存後の各セクションの id (レスポンスを送られた順に対応付けるため)。
   * 期限切れとして作らなかったセクションは null
   */
  ids: (string | null)[];
};

/**
 * 送られた順を position (0 始まり) として、既存の行との差分を求める。
 * - id が既存と一致すれば更新 (内容も並び順もタグも同じなら触らない: updatedAt を進めない)
 * - 期限切れの行 (expiredIds: 見えないが、中身を消した印として残っている行) の id は作らない。
 *   保持日数を短く設定できた頃の行は createdAt + 30 日より早く期限が来るので、下の createdAt の判定を通ってしまうため (HAY-60)
 * - 知らない id で、createdAt が expiredCreatedAt 以前 (= 保持日数を過ぎて期限切れ) のものは作らない。
 *   期限を過ぎて消えた行を、それを知らない古いタブが送り返してきた場合など (issue #94)。作らなかったものは position を詰める。
 *   期限が createdAt + 30 日より後の行 (保持日数を長く設定できた頃のもの。drizzle/0012 で頭打ちにしたが、0012 を流してから
 *   Worker を替えるまでに前の Worker が作った行は、次の migration まで残る) も、見えている間は既存の行として id で
 *   突き合わさるのでこの判定に来ない。消えた後なら createdAt + 30 日も過ぎているので、やはり作らない
 * - それ以外は新規作成 (id は newId で発行する)。同じ id が 2 回来たら 2 つ目以降は新規 (1 つの行を 2 か所に置けないため)
 * - 送られてこなかった既存の行は削除
 */
export function planBoardSync(
  existing: ExistingSection[],
  sections: IncomingSection[],
  expiredCreatedAt: Date,
  expiredIds: ReadonlySet<string>,
  newId: () => string = () => crypto.randomUUID(),
): BoardSyncPlan {
  const byId = new Map(existing.map((row) => [row.id, row]));
  const kept = new Set<string>();
  const plan: BoardSyncPlan = { updates: [], inserts: [], deletes: [], ids: [] };
  let position = 0;
  for (const section of sections) {
    const row = section.id !== null && !kept.has(section.id) ? byId.get(section.id) : undefined;
    // 同じ id の 2 つ目以降 (byId にはある) は期限を見ずに新規にする。期限が createdAt + 30 日より後の行 (上の説明) は
    // createdAt が古くてもまだ見えているので、createdAt で判定すると見えている行の写しを捨ててしまう
    if (
      section.id !== null &&
      !byId.has(section.id) &&
      isExpired(section.id, section.createdAt, expiredCreatedAt, expiredIds)
    ) {
      plan.ids.push(null);
      continue;
    }
    if (!row) {
      const id = newId();
      plan.inserts.push({ id, content: section.content, position, tagId: section.tagId ?? null });
      plan.ids.push(id);
    } else {
      kept.add(row.id);
      plan.ids.push(row.id);
      const tagId = section.tagId === undefined ? row.tagId : section.tagId;
      if (row.content !== section.content || row.position !== position || row.tagId !== tagId) {
        plan.updates.push({ id: row.id, content: section.content, position, tagId });
      }
    }
    position++;
  }
  plan.deletes = existing.filter((row) => !kept.has(row.id)).map((row) => row.id);
  return plan;
}

function isExpired(
  id: string,
  createdAt: string | undefined,
  expiredCreatedAt: Date,
  expiredIds: ReadonlySet<string>,
): boolean {
  if (expiredIds.has(id)) return true;
  return createdAt !== undefined && new Date(createdAt).getTime() <= expiredCreatedAt.getTime();
}

/**
 * 登録されていないタグの id (別の場所で登録を消された後に、それを知らない画面が送ってきた) を「タグなし」にする。
 * tagId の項目が無いもの (タグを知らない送り手) はそのまま (今のタグを変えない。IncomingSection)
 */
export function dropUnregisteredTags<T extends IncomingSection>(
  sections: T[],
  registered: ReadonlySet<string>,
): T[] {
  return sections.map((section) =>
    typeof section.tagId === "string" && !registered.has(section.tagId)
      ? { ...section, tagId: null }
      : section,
  );
}
