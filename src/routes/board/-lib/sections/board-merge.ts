import {
  type BoardSection,
  type DraftSection,
  editedSince,
  type EditableSection,
  newSection,
  toEditable,
} from "../data/board";
import { effectiveTagId } from "../tag-filter";

/**
 * 画面の板 (local) に、別の端末 / タブで保存された板 (remote) を取り込む (issue #72)。
 * base は local が前提にしている保存済みの板 (前回の取得 / 保存の結果) で、各セクションが
 * 「手元で変えたのか、別の場所で変わったのか」を id ごとに base と比べて決める。
 * - 手元で変えたセクションは手元の内容とタグを残す (両方で変えていれば手元が勝つ)。変えていなければ remote の
 *   内容とタグにする。内容とタグはまとめて 1 つの変更として扱う (片方ずつ混ぜると、どちらの画面にも無かった組み合わせになる)
 * - 別の場所で足されたセクションは、remote で直前にあるセクションの後ろに差し込む (無ければ先頭)
 * - 別の場所で消された (期限切れも含む) セクションは、手元で変えていなければ消す。変えていれば
 *   新しいセクションとして残す (編集を失わない)
 * - 手元で消したセクションは、別の場所で変えられていなければ消したまま。変えられていれば戻す
 * - まだ保存していない (id の無い) セクションはそのまま
 * - registered (remote を読んだ時点で登録済みだったタグの id と、その後にこの画面が知ったタグの id。useBoardTags の
 *   registeredAsOf) に無いタグ (別の場所で登録を消された) は、local と base のどちらでも「タグなし」として比べ、取り込む。
 *   登録を消すとサーバはそのタグを付けていた行から外すので、そのまま比べると外れたことが「別の場所での変更」に見え、
 *   手元で消したばかりのセクションが戻ってきてしまう
 * 並び順は手元のものを基本にする (見ている画面がなるべく動かないように)。
 * 手元のセクションは key を保つので、編集中のエディタはそのまま残る
 */
export function mergeBoard(
  local: EditableSection[],
  base: DraftSection[],
  remote: BoardSection[],
  registered: { has(id: string): boolean },
): EditableSection[] {
  const tagOf = (s: { tagId?: string | null }) => effectiveTagId(s.tagId, registered);
  const baseById = new Map(base.flatMap((s) => (s.id === null ? [] : [[s.id, s]])));
  /** base と比べて内容かタグが違うか (base に無ければ違う扱い) */
  const differs = (id: string, s: { content: string; tagId?: string | null }) => {
    const b = baseById.get(id);
    return b === undefined || s.content !== b.content || tagOf(s) !== tagOf(b);
  };
  const remoteById = new Map(remote.map((s) => [s.id, s]));
  const rewritten = editedSince(base);
  // 手元に残った (remote の行と対応付けた) id
  const kept = new Set<string>();

  const merged: EditableSection[] = [];
  for (const s of local) {
    if (s.id === null) {
      merged.push(s);
      continue;
    }
    const changed = differs(s.id, s);
    const r = remoteById.get(s.id);
    // 別の場所で消された (期限切れも含む) ときに残すかは、内容を書き換えたかだけで決める。タグだけの変更で残すと、
    // 中身に手を入れていないメモが新しい期限で作り直され、30 日で消えなくなる (applySaved / pruneExpired と同じ)
    if (r && !kept.has(s.id)) {
      kept.add(s.id);
      merged.push({
        ...s,
        content: changed ? s.content : r.content,
        tagId: changed ? tagOf(s) : tagOf(r),
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
      });
    } else if (rewritten(s)) {
      // 別の場所で消されたが手元で書き換えた (または同じ id の 2 つ目): 新しいセクションとして残す
      merged.push({ ...s, tagId: tagOf(s), id: null, createdAt: null, expiresAt: null });
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
    // 手元で消しただけ (別の場所では変わっていない)
    if (!differs(r.id, r)) continue;
    const [section] = toEditable([r]);
    const at = anchor === null ? atStart++ : merged.findIndex((s) => s.id === anchor) + 1;
    merged.splice(at, 0, section!);
    kept.add(r.id);
    anchor = r.id;
  }

  return merged.length > 0 ? merged : [newSection()];
}
