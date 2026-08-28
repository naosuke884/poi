import type { InferResponseType } from "hono/client";
import { api } from "@/lib/api";

// GET /api/memos のレスポンス型。Date は JSON 経由で ISO 文字列になる
export type MemoListItem = InferResponseType<typeof api.memos.$get, 200>["memos"][number];

// 残り日数がこの値以下なら警告色で表示する
export const MEMO_EXPIRY_WARNING_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * expiresAt までの残り日数 (切り上げ)。
 * 期限切れ (負の値) は 0 に丸める。API は期限切れメモを返さないので通常は 1 以上になる。
 */
export function remainingDays(expiresAt: string | number | Date, now: Date = new Date()): number {
  const diff = new Date(expiresAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / DAY_MS));
}

/** 一覧カードに表示するタイトル。title が無ければ本文の先頭行 (空なら「無題」) */
export function memoDisplayTitle(memo: { title: string | null; content: string }): string {
  const title = memo.title?.trim();
  if (title) return title;
  const firstLine = memo.content.split(/\r?\n/).find((line) => line.trim() !== "");
  return firstLine?.trim() || "無題";
}

/** 更新日時などの表示用フォーマット (端末のタイムゾーン) */
export function formatDateTime(value: string | number | Date): string {
  return new Date(value).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// GET /api/memos/:id のレスポンス型 (編集画面用)
export type MemoDetail = InferResponseType<(typeof api.memos)[":id"]["$get"], 200>["memo"];

/** 期限日など日付だけの表示用フォーマット (YYYY/MM/DD、端末のタイムゾーン) */
export function formatDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
