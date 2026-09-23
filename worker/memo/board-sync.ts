// PUT /api/board (板の丸ごと置き換え) で、送られてきたセクションを既存の行とどう突き合わせるかを決める。
// DB に触らない純粋関数にして、ルート (routes.ts) はこの結果を batch にするだけにする

/** 既存の行のうち突き合わせに使う部分 */
export type ExistingSection = { id: string; content: string; position: number };

/** 送られてきた 1 セクション。id は「前回保存したセクション」を引き継ぐときだけ付く */
export type IncomingSection = { id: string | null; content: string };

export type BoardSyncPlan = {
  /** 内容か並び順が変わった既存の行 (createdAt / expiresAt は維持する) */
  updates: { id: string; content: string; position: number }[];
  /** 新しく作る行 (id が null / 知らない id / 同じ id の 2 つ目以降) */
  inserts: { content: string; position: number }[];
  /** 送られてこなかった既存の行 */
  deletes: string[];
};

/**
 * 送られた順を position (0 始まり) として、既存の行との差分を求める。
 * - id が既存と一致すれば更新 (内容も並び順も同じなら触らない: updatedAt を進めない)
 * - それ以外は新規作成。同じ id が 2 回来たら 2 つ目以降は新規 (1 つの行を 2 か所に置けないため)
 * - 送られてこなかった既存の行は削除
 */
export function planBoardSync(
  existing: ExistingSection[],
  sections: IncomingSection[],
): BoardSyncPlan {
  const byId = new Map(existing.map((row) => [row.id, row]));
  const kept = new Set<string>();
  const plan: BoardSyncPlan = { updates: [], inserts: [], deletes: [] };
  sections.forEach((section, position) => {
    const row = section.id !== null && !kept.has(section.id) ? byId.get(section.id) : undefined;
    if (!row) {
      plan.inserts.push({ content: section.content, position });
      return;
    }
    kept.add(row.id);
    if (row.content !== section.content || row.position !== position) {
      plan.updates.push({ id: row.id, content: section.content, position });
    }
  });
  plan.deletes = existing.filter((row) => !kept.has(row.id)).map((row) => row.id);
  return plan;
}
