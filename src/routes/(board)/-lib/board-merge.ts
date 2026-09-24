import {
  type BoardSection,
  type DraftSection,
  type EditableSection,
  newSection,
  toEditable,
} from "@/routes/-lib/board";

/**
 * 画面の板 (local) に、別の端末 / タブで保存された板 (remote) を取り込む (issue #72)。
 * base は local が前提にしている保存済みの板 (前回の取得 / 保存の結果) で、各セクションが
 * 「手元で変えたのか、別の場所で変わったのか」を id ごとに base と比べて決める。
 * - 手元で変えたセクションは手元の内容を残す (両方で変えていれば手元が勝つ)。変えていなければ remote の内容にする
 * - 別の場所で足されたセクションは、remote で直前にあるセクションの後ろに差し込む (無ければ先頭)
 * - 別の場所で消された (期限切れも含む) セクションは、手元で変えていなければ消す。変えていれば
 *   新しいセクションとして残す (編集を失わない)
 * - 手元で消したセクションは、別の場所で変えられていなければ消したまま。変えられていれば戻す
 * - まだ保存していない (id の無い) セクションはそのまま
 * 並び順は手元のものを基本にする (見ている画面がなるべく動かないように)。
 * 手元のセクションは key を保つので、編集中のエディタはそのまま残る
 */
export function mergeBoard(
  local: EditableSection[],
  base: DraftSection[],
  remote: BoardSection[],
): EditableSection[] {
  const baseById = new Map(base.flatMap((s) => (s.id === null ? [] : [[s.id, s.content]])));
  const remoteById = new Map(remote.map((s) => [s.id, s]));
  // 手元に残った (remote の行と対応付けた) id
  const kept = new Set<string>();

  const merged: EditableSection[] = [];
  for (const s of local) {
    if (s.id === null) {
      merged.push(s);
      continue;
    }
    const baseContent = baseById.get(s.id);
    const changed = baseContent === undefined || s.content !== baseContent;
    const r = remoteById.get(s.id);
    if (r && !kept.has(s.id)) {
      kept.add(s.id);
      merged.push({
        ...s,
        content: changed ? s.content : r.content,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
      });
    } else if (changed) {
      // 別の場所で消されたが手元で変えた (または同じ id の 2 つ目): 新しいセクションとして残す
      merged.push({ ...s, id: null, createdAt: null, expiresAt: null });
    }
  }

  // 手元に無い remote のセクション: 別の場所で足された / 手元で消したが別の場所で変えられた
  let anchor: string | null = null;
  let atStart = 0;
  for (const r of remote) {
    if (kept.has(r.id)) {
      anchor = r.id;
      continue;
    }
    const baseContent = baseById.get(r.id);
    // 手元で消しただけ (別の場所では変わっていない)
    if (baseContent !== undefined && baseContent === r.content) continue;
    const [section] = toEditable([r]);
    const at = anchor === null ? atStart++ : merged.findIndex((s) => s.id === anchor) + 1;
    merged.splice(at, 0, section!);
    kept.add(r.id);
    anchor = r.id;
  }

  return merged.length > 0 ? merged : [newSection()];
}
