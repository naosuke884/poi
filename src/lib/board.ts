import type { InferResponseType } from "hono/client";
import { SECTION_SEPARATOR } from "../../worker/memo/constants";
import { api } from "@/lib/api";

// GET /api/board のレスポンスの 1 セクション。Date は JSON 経由で ISO 文字列になる
export type BoardSection = InferResponseType<typeof api.board.$get, 200>["sections"][number];

// PUT /api/board に送る 1 セクション。id は「前回保存したセクション」を引き継ぐときだけ付ける
export type DraftSection = { id: string | null; content: string };

/**
 * 画面上の 1 セクション (編集中ならエディタ (SectionEditor)、それ以外は Markdown 表示)。
 * key は React の key とエディタの参照に使う画面内だけの識別子 (id は保存するまで無いので別に持つ)。
 * 分割 / 結合ではフォーカスのあるエディタの DOM を使い回すため、key と id は別々に引き継がれる
 * (key はフォーカスのある部分に、id は先頭の部分に付く)。
 * id / expiresAt はサーバに保存済みのときだけ入る
 */
export type EditableSection = {
  key: string;
  id: string | null;
  content: string;
  expiresAt: string | null;
};

let seq = 0;
export function newKey(): string {
  return `s${++seq}`;
}
export function newSection(content = ""): EditableSection {
  return { key: newKey(), id: null, content, expiresAt: null };
}

/** サーバから取得したセクションを画面用にする */
export function toEditable(sections: BoardSection[]): EditableSection[] {
  return sections.map((s) => ({ ...newSection(s.content), id: s.id, expiresAt: s.expiresAt }));
}

/**
 * 画面上のセクションから保存するものを選ぶ。空のセクションは送らない (= サーバには残らない。
 * 画面には残るので、書き足せば新しいセクションとして保存される)。
 * key は保存後にサーバが付けた id / 期限を画面のセクションへ戻すために持つ
 */
export function toDraft(sections: EditableSection[]): (DraftSection & { key: string })[] {
  return sections
    .filter((s) => s.content !== "")
    .map(({ key, id, content }) => ({ key, id, content }));
}

/** 保存対象が前回保存したものと同じか (id と内容と並び順) */
export function sameDraft(a: DraftSection[], b: DraftSection[]): boolean {
  return a.length === b.length && a.every((s, i) => s.id === b[i]!.id && s.content === b[i]!.content);
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

/**
 * 期限までの残り日数 (切り上げ)。書いた直後は TTL と同じ日数、最終日は 1。期限切れなら 0
 * (期限切れのセクションはサーバが返さないので、通常 0 にはならない)
 */
export function daysUntil(value: string | number | Date, now: number = Date.now()): number {
  const ms = new Date(value).getTime() - now;
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** 期限日など日付だけの表示用フォーマット (YYYY/MM/DD、端末のタイムゾーン) */
export function formatDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
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
