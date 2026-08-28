import type { InferResponseType } from "hono/client";
import { SECTION_SEPARATOR } from "../../worker/memo/constants";
import { api } from "@/lib/api";

// GET /api/board のレスポンスの 1 セクション。Date は JSON 経由で ISO 文字列になる
export type BoardSection = InferResponseType<typeof api.board.$get, 200>["sections"][number];

// PUT /api/board に送る 1 セクション。id は「前回保存したセクション」を引き継ぐときだけ付ける
export type DraftSection = { id: string | null; content: string };

/**
 * Textarea のテキストをセクションに分ける。区切りは空行 1 つ (SECTION_SEPARATOR = "\n\n")。
 * 単独の改行はセクションの中身に含める。空文字は「セクションが無い」扱い。
 * 分割と結合 (joinSections) が必ず往復するよう、区切りは "\n\n" ちょうどで、それ以外は一切変えない
 * (空行が 2 つ以上続けば余った改行は次のセクションの先頭に付く / 空のセクションになる)
 */
export function splitSections(text: string): string[] {
  return text === "" ? [] : text.split(SECTION_SEPARATOR);
}

/** セクションをテキストに戻す (splitSections の逆) */
export function joinSections(sections: { content: string }[]): string {
  return sections.map((s) => s.content).join(SECTION_SEPARATOR);
}

/**
 * 前回保存したセクション (saved) と現在のテキストのセクション (draft) を突き合わせ、PUT /api/board に送る配列を作る。
 * セクションの id を引き継ぐと作成日 (= 期限) が維持されるので、できるだけ引き継ぐ:
 * - 内容がそのままのセクションは LCS (最長共通部分列) で対応付ける
 * - 対応が取れなかった区間では、消えたものと増えたものを順番に 1 対 1 で組にする (= そのセクションを書き換えたとみなす)
 * - 余った増えたものは id: null (新しいセクション)。余った消えたものは削除される
 */
export function diffSections(
  saved: { id: string; content: string }[],
  draft: string[],
): DraftSection[] {
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

  const result: DraftSection[] = [];
  let i = 0;
  let j = 0;
  // 対応が取れていない saved 側のセクション (書き換え候補として次に増えたものへ id を渡す)
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
