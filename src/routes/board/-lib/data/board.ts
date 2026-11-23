import { BOARD_MAX_LENGTH, BOARD_MAX_SECTIONS, boardLength } from "@shared/constants";
import type { InferResponseType } from "hono/client";

import type { api } from "@/lib/api";

// GET /api/board のレスポンスの 1 セクション。Date は JSON 経由で ISO 文字列になる
export type BoardSection = InferResponseType<typeof api.board.$get, 200>["sections"][number];

// PUT /api/board に送る 1 セクション。id は「前回保存したセクション」を引き継ぐときだけ付ける。
// createdAt はその行の作成日時 (保存済みのときだけ。サーバが期限切れか判定する: issue #94)
export type DraftSection = {
  id: string | null;
  content: string;
  /** 付けたタグ (登録済みのタグの id。付けていなければ null) */
  tagId: string | null;
  createdAt?: string | null;
};

/**
 * 画面上の 1 セクション (編集中ならエディタ (SectionEditor)、それ以外は Markdown 表示)。
 * key は React の key とエディタの参照に使う画面内だけの識別子 (id は保存するまで無いので別に持つ)。
 * 結合ではフォーカスのあるエディタの DOM を使い回すため、key と id は別々に引き継がれる
 * (key はフォーカスのある方に、id は前のセクションに付く。前がまだ保存していなければ後ろのものを保つ)。
 * id / createdAt / expiresAt はサーバに保存済みのときだけ入る
 */
export type EditableSection = {
  key: string;
  id: string | null;
  content: string;
  /**
   * 付けたタグ (登録済みのタグの id。付けていなければ null)。別の場所で登録を消されたタグの id が残っていることが
   * あり、そのときはタグなしとして見せる (次の保存でサーバが外す)
   */
  tagId: string | null;
  createdAt: string | null;
  expiresAt: string | null;
};

let seq = 0;
function newKey(): string {
  return `s${++seq}`;
}
export function newSection(content = ""): EditableSection {
  return { key: newKey(), id: null, content, tagId: null, createdAt: null, expiresAt: null };
}

/** サーバから取得したセクションを画面用にする */
export function toEditable(sections: BoardSection[]): EditableSection[] {
  return sections.map((s) => ({
    ...newSection(s.content),
    id: s.id,
    // タグの導入前に端末に残したキャッシュ (オフライン表示) の行には tagId が無い
    tagId: s.tagId ?? null,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
  }));
}

/**
 * 最後の保存 (saved) の後に、手元で内容を書き換えたか (saved に無い id のものも書き換えた扱い)。
 * 期限切れのセクションを外すか、id を外して新しいセクションとして残すかを決める。
 * タグだけの変更は数えない: 残すと、中身に手を入れていないメモが新しい期限で作り直され、30 日で消えなくなる
 */
export function editedSince(saved: DraftSection[]) {
  const content = new Map(saved.map((s) => [s.id, s.content]));
  return (s: { id: string | null; content: string }) => content.get(s.id) !== s.content;
}

/**
 * 期限を過ぎたセクションを画面から外す。サーバはもう見せず (Cron で消える)、その id を送り返すと
 * 「知らない id」として新しい期限で作り直されてしまうため (issue #74)。
 * ただし最後の保存 (saved) の後に書き換えていたものは、入力を失わないよう消さずに id を外す
 * (新しいセクションとして保存される)。
 * expiredIds は期限切れだった id (保存済みの控えからも除くため)。期限切れが無ければ null
 */
export function pruneExpired(
  sections: EditableSection[],
  saved: DraftSection[],
  now: number,
): { next: EditableSection[]; expiredIds: Set<string> } | null {
  const isExpired = (s: EditableSection) =>
    s.id !== null && s.expiresAt !== null && new Date(s.expiresAt).getTime() <= now;
  if (!sections.some(isExpired)) return null;
  const edited = editedSince(saved);
  const expiredIds = new Set<string>();
  const next: EditableSection[] = [];
  for (const s of sections) {
    if (s.id === null || !isExpired(s)) {
      next.push(s);
      continue;
    }
    expiredIds.add(s.id);
    if (edited(s)) {
      next.push({ ...s, id: null, createdAt: null, expiresAt: null });
    }
  }
  return { next: next.length > 0 ? next : [newSection()], expiredIds };
}

/**
 * 画面上のセクションから保存するものを選ぶ。空のセクションは送らない (= サーバには残らない。
 * 画面には残るので、書き足せば新しいセクションとして保存される)。
 * key は保存後にサーバが付けた id / 期限を画面のセクションへ戻すために持つ
 */
export function toDraft(sections: EditableSection[]): (DraftSection & { key: string })[] {
  return sections
    .filter((s) => s.content !== "")
    .map(({ key, id, content, tagId, createdAt }) => ({ key, id, content, tagId, createdAt }));
}

/** 保存対象が前回保存したものと同じか (id と内容とタグと並び順) */
export function sameDraft(a: DraftSection[], b: DraftSection[]): boolean {
  return (
    a.length === b.length &&
    a.every((s, i) => s.id === b[i]!.id && s.content === b[i]!.content && s.tagId === b[i]!.tagId)
  );
}

/**
 * 保存の上限チェック。超えていればエラーメッセージ、収まっていれば null。
 * 上限はサーバ (PUT /api/board) と同じ値で、拒否される量を送る前に UI 側で気づくためのもの
 */
export function overLimitMessage(draft: DraftSection[]): string | null {
  if (draft.length > BOARD_MAX_SECTIONS)
    return `セクション数が上限 (${BOARD_MAX_SECTIONS.toLocaleString()}) を超えています`;
  if (boardLength(draft) > BOARD_MAX_LENGTH)
    return `文字数が上限 (${BOARD_MAX_LENGTH.toLocaleString()}) を超えています`;
  return null;
}

/**
 * 保存のレスポンスを画面上のセクションに戻す。draft は送ったもの、updated はその順の保存後の行、
 * saved は送る前の保存済みの控え。
 * - 送ったセクションにはサーバの id と期限を付ける (保存中の入力 (content) はそのまま残す)。
 *   タグはサーバの保存したものにする (登録に無いタグはサーバが外す)。ただし保存中に付け替えていれば手元のまま。
 *   サーバが外したタグを画面に残すと、保存済みの控え (サーバの行) といつまでも食い違い、保存を繰り返す
 * - 保存中に結合されて、送ったときと違う id を持った (mergeSections が前のセクションか保存済みの方の id を残した)
 *   ときは、その id のままにする (送ったときの id の行で上書きすると、次の保存で残すはずの行が消され、
 *   その内容が後ろのセクションの (より遅い) 期限で残ったり、新しい期限で作り直されたりする)
 * - 送っていない (空だった) セクションはサーバから消えているので id を外す
 * - サーバが期限切れとして作らなかったセクション (null。画面の知らないうちに期限を過ぎたときなど: issue #94) は
 *   画面から外す。ただし前回の保存の後に書き換えていたものは、入力を失わないよう id を外して残す
 *   (新しいセクションとして保存される。pruneExpired と同じ扱い)
 */
export function applySaved(
  sections: EditableSection[],
  draft: { key: string; id: string | null; tagId: string | null }[],
  updated: (BoardSection | null)[],
  saved: DraftSection[],
): EditableSection[] {
  const byKey = new Map(
    draft.map((d, i) => [d.key, { sentId: d.id, sentTag: d.tagId, u: updated[i] }]),
  );
  const edited = editedSince(saved);
  const next: EditableSection[] = [];
  for (const s of sections) {
    const { sentId, sentTag, u } = byKey.get(s.key) ?? {};
    if (u && s.id !== sentId) {
      next.push(s);
    } else if (u) {
      const tagId = s.tagId === sentTag ? (u.tagId ?? null) : s.tagId;
      next.push({ ...s, id: u.id, tagId, createdAt: u.createdAt, expiresAt: u.expiresAt });
    } else if (u === null && !edited(s)) {
      // 期限切れで作られず、書き換えてもいない: 外す
    } else {
      next.push(s.id === null ? s : { ...s, id: null, createdAt: null, expiresAt: null });
    }
  }
  return next.length > 0 ? next : [newSection()];
}

/** 保存済みの控え (差分の有無の判定用) にする形: id と内容とタグだけに絞る */
export function toSaved(
  sections: { id: string | null; content: string; tagId?: string | null }[],
): DraftSection[] {
  return sections.map(({ id, content, tagId }) => ({ id, content, tagId: tagId ?? null }));
}

/**
 * PUT /api/board に送る payload (key など画面内だけの情報は落とす)。
 * userId は保存先として想定している板の持ち主。セッションのユーザーと違えばサーバは保存しない (409)。
 * revision は draft の前提にした板の版。サーバの今の版と違えば (別の場所で保存されていれば) 保存しない (409)
 */
export function toPutPayload(
  userId: string,
  revision: string | null,
  draft: DraftSection[],
): {
  userId: string;
  revision: string | null;
  sections: { id: string | null; content: string; tagId: string | null; createdAt?: string }[];
} {
  return {
    userId,
    revision,
    sections: draft.map(({ id, content, tagId, createdAt }) =>
      id !== null && createdAt ? { id, content, tagId, createdAt } : { id, content, tagId },
    ),
  };
}

/** 取得日時などの表示用フォーマット (端末のタイムゾーン) */
export function formatDateTime(value: string | number | Date): string {
  return new Date(value).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
