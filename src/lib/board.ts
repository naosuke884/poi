import {
  BOARD_MAX_LENGTH,
  BOARD_MAX_SECTIONS,
  boardLength,
  memoExpiresAt,
  SECTION_SEPARATOR,
} from "@worker/memo/constants";
import type { InferResponseType } from "hono/client";
import type { api } from "@/lib/api";

// GET /api/board のレスポンスの 1 セクション。Date は JSON 経由で ISO 文字列になる
export type BoardSection = InferResponseType<typeof api.board.$get, 200>["sections"][number];

// PUT /api/board に送る 1 セクション。id は「前回保存したセクション」を引き継ぐときだけ付ける。
// createdAt はその行の作成日時 (保存済みのときだけ。サーバが今の保持日数で期限切れか判定する: issue #94)
export type DraftSection = { id: string | null; content: string; createdAt?: string | null };

/**
 * 画面上の 1 セクション (編集中ならエディタ (SectionEditor)、それ以外は Markdown 表示)。
 * key は React の key とエディタの参照に使う画面内だけの識別子 (id は保存するまで無いので別に持つ)。
 * 分割 / 結合ではフォーカスのあるエディタの DOM を使い回すため、key と id は別々に引き継がれる
 * (key はフォーカスのある部分に、id は先頭の部分に付く)。
 * id / createdAt / expiresAt はサーバに保存済みのときだけ入る (createdAt は保持日数の変更で期限を引き直すため)
 */
export type EditableSection = {
  key: string;
  id: string | null;
  content: string;
  createdAt: string | null;
  expiresAt: string | null;
};

let seq = 0;
export function newKey(): string {
  return `s${++seq}`;
}
export function newSection(content = ""): EditableSection {
  return { key: newKey(), id: null, content, createdAt: null, expiresAt: null };
}

/** サーバから取得したセクションを画面用にする */
export function toEditable(sections: BoardSection[]): EditableSection[] {
  return sections.map((s) => ({
    ...newSection(s.content),
    id: s.id,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
  }));
}

/**
 * 保持日数が変わったときの期限の引き直し (サーバの PUT /api/settings と同じ規則)。
 * まだ期限の来ていない保存済みのセクションを createdAt + ttlDays にする。期限を過ぎたものは延ばさない
 */
export function applyTtlDays(
  sections: EditableSection[],
  ttlDays: number,
  now: number,
): EditableSection[] {
  return sections.map((s) => {
    if (s.createdAt === null || s.expiresAt === null) return s;
    if (new Date(s.expiresAt).getTime() <= now) return s;
    return { ...s, expiresAt: memoExpiresAt(new Date(s.createdAt), ttlDays).toISOString() };
  });
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
  const savedContent = new Map(saved.map((s) => [s.id, s.content]));
  const expiredIds = new Set<string>();
  const next: EditableSection[] = [];
  for (const s of sections) {
    if (s.id === null || !isExpired(s)) {
      next.push(s);
      continue;
    }
    expiredIds.add(s.id);
    if (savedContent.get(s.id) !== s.content) {
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
    .map(({ key, id, content, createdAt }) => ({ key, id, content, createdAt }));
}

/** 保存対象が前回保存したものと同じか (id と内容と並び順) */
export function sameDraft(a: DraftSection[], b: DraftSection[]): boolean {
  return (
    a.length === b.length && a.every((s, i) => s.id === b[i]!.id && s.content === b[i]!.content)
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
 * - 送ったセクションにはサーバの id と期限を付ける (保存中の入力 (content) はそのまま残す)
 * - 送っていない (空だった) セクションはサーバから消えているので id を外す
 * - サーバが期限切れとして作らなかったセクション (null。別のタブで保持日数を短くしたときなど: issue #94) は
 *   画面から外す。ただし前回の保存の後に書き換えていたものは、入力を失わないよう id を外して残す
 *   (新しいセクションとして保存される。pruneExpired と同じ扱い)
 */
export function applySaved(
  sections: EditableSection[],
  draft: { key: string }[],
  updated: (BoardSection | null)[],
  saved: DraftSection[],
): EditableSection[] {
  const byKey = new Map(draft.map((d, i) => [d.key, updated[i]]));
  const savedContent = new Map(saved.map((s) => [s.id, s.content]));
  const next: EditableSection[] = [];
  for (const s of sections) {
    const u = byKey.get(s.key);
    if (u) {
      next.push({ ...s, id: u.id, createdAt: u.createdAt, expiresAt: u.expiresAt });
    } else if (u === null && savedContent.get(s.id) === s.content) {
      // 期限切れで作られず、書き換えてもいない: 外す
    } else {
      next.push(s.id === null ? s : { ...s, id: null, createdAt: null, expiresAt: null });
    }
  }
  return next.length > 0 ? next : [newSection()];
}

/** 保存済みの控え (差分の有無の判定用) にする形: id と内容だけに絞る */
export function toSaved(sections: { id: string | null; content: string }[]): DraftSection[] {
  return sections.map(({ id, content }) => ({ id, content }));
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
  sections: { id: string | null; content: string; createdAt?: string }[];
} {
  return {
    userId,
    revision,
    sections: draft.map(({ id, content, createdAt }) =>
      id !== null && createdAt ? { id, content, createdAt } : { id, content },
    ),
  };
}

/**
 * エディタの入力に区切り (空行 2 つ = SECTION_SEPARATOR) が含まれていたら、そこでセクションを分ける。
 * 区切りが無ければ null。
 * parts は分けた後の各セクションの内容 (区切りちょうどで分けるだけで、それ以外の改行は残す)。
 * focus はカーソル (cursor: 入力後のカーソル位置) を置く先の part とその中の位置。
 * カーソルが区切りの途中 (改行 3 つの間) にあるときは次の part の先頭に置く
 */
export function splitAtSeparator(
  text: string,
  cursor: number,
): { parts: string[]; focus: { index: number; offset: number } } | null {
  if (!text.includes(SECTION_SEPARATOR)) return null;
  const parts = text.split(SECTION_SEPARATOR);
  let start = 0;
  for (let i = 0; i < parts.length; i++) {
    const end = start + parts[i]!.length;
    if (cursor <= end) return { parts, focus: { index: i, offset: cursor - start } };
    start = end + SECTION_SEPARATOR.length;
    if (cursor < start) return { parts, focus: { index: i + 1, offset: 0 } };
  }
  const last = parts.length - 1;
  return { parts, focus: { index: last, offset: parts[last]!.length } };
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
