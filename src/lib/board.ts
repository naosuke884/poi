import type { InferResponseType } from "hono/client";
import { api } from "@/lib/api";

// GET /api/board のレスポンスの 1 行。Date は JSON 経由で ISO 文字列になる
export type BoardLine = InferResponseType<typeof api.board.$get, 200>["lines"][number];

// PUT /api/board に送る 1 行。id は「前回保存した行」を引き継ぐときだけ付ける
export type DraftLine = { id: string | null; content: string };

/** Textarea のテキストを行に分ける。空文字は「行が無い」扱い */
export function splitLines(text: string): string[] {
  return text === "" ? [] : text.split(/\r\n?|\n/);
}

/** 行をテキストに戻す (splitLines の逆) */
export function joinLines(lines: { content: string }[]): string {
  return lines.map((l) => l.content).join("\n");
}

/**
 * 前回保存した行 (saved) と現在のテキストの行 (draft) を突き合わせ、PUT /api/board に送る行を作る。
 * 行の id を引き継ぐと作成日 (= 期限) が維持されるので、できるだけ引き継ぐ:
 * - 内容がそのままの行は LCS (最長共通部分列) で対応付ける
 * - 対応が取れなかった区間では、消えた行と増えた行を順番に 1 対 1 で組にする (= その行を書き換えたとみなす)
 * - 余った増えた行は id: null (新しい行)。余った消えた行は削除される
 */
export function diffLines(saved: { id: string; content: string }[], draft: string[]): DraftLine[] {
  const n = saved.length;
  const m = draft.length;
  // lcs[i][j] = saved[i..] と draft[j..] の LCS 長
  const width = m + 1;
  const lcs = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        saved[i]!.content === draft[j]!
          ? lcs[(i + 1) * width + j + 1]! + 1
          : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
    }
  }

  const result: DraftLine[] = [];
  let i = 0;
  let j = 0;
  // 対応が取れていない saved 側の行 (書き換え候補として次に増えた行へ id を渡す)
  let pendingRemoved: string[] = [];
  const flushGap = (added: string[]) => {
    for (let k = 0; k < added.length; k++) {
      result.push({ id: pendingRemoved[k] ?? null, content: added[k]! });
    }
    pendingRemoved = [];
  };
  let pendingAdded: string[] = [];
  while (i < n || j < m) {
    if (i < n && j < m && saved[i]!.content === draft[j]!) {
      flushGap(pendingAdded);
      pendingAdded = [];
      result.push({ id: saved[i]!.id, content: draft[j]! });
      i++;
      j++;
    } else if (j < m && (i >= n || lcs[i * width + j + 1]! >= lcs[(i + 1) * width + j]!)) {
      pendingAdded.push(draft[j]!);
      j++;
    } else {
      pendingRemoved.push(saved[i]!.id);
      i++;
    }
  }
  flushGap(pendingAdded);
  return result;
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
