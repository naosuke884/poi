import { api } from "@/lib/api";
import type { BoardSection } from "@/lib/board";
import { readCachedBoard, writeCachedBoard } from "@/lib/board-cache";
import { fetchOrOffline, OfflineError } from "@/lib/offline";
import { clearOfflineCaches, type LoginContext } from "@/lib/require-login";

/** トップ (/) に出すもの: 未ログインならランディング、ログイン済みなら板 */
export type TopPage =
  | { kind: "landing" }
  | {
      kind: "board";
      sections: BoardSection[];
      /** 保存期間。オフラインのキャッシュ表示では不明 (Board は既定値の表示にする) */
      ttlDays: number | undefined;
      /** キャッシュから表示している (オンラインで取得できなかった) */
      offline: boolean;
      /** キャッシュの取得日時 (offline のときだけ) */
      cachedAt: number | null;
      /** 板の持ち主。sections と同じスナップショットから取る (BoardView の key に使う。issue #52) */
      userId: string;
    };

/**
 * トップの loader の中身。板を取得し、取れたらオフライン閲覧用のキャッシュを最新にする。
 * - オフライン: 前回取得した内容があれば閲覧専用で返す (offline: true)。無ければ OfflineError
 * - 401 (beforeLoad の後にセッションが切れた): この端末に残るキャッシュを消してランディングにする
 */
export async function loadTopPage(session: LoginContext["session"]): Promise<TopPage> {
  if (session === null) return { kind: "landing" };
  const userId = session.user.id;
  let res;
  try {
    res = await fetchOrOffline(() => api.board.$get());
  } catch (e) {
    if (!(e instanceof OfflineError)) throw e;
    const cached = readCachedBoard(userId);
    if (!cached) {
      throw new OfflineError(
        "オフラインのため、板を取得できません (まだ一度も取得していないためキャッシュもありません)。",
      );
    }
    // 保存期間 (ttlDays) はキャッシュしていないので不明
    return {
      kind: "board",
      sections: cached.sections,
      ttlDays: undefined,
      offline: true,
      cachedAt: cached.cachedAt,
      userId,
    };
  }
  if (res.status === 401) {
    clearOfflineCaches([userId]);
    return { kind: "landing" };
  }
  if (!res.ok) throw new Error("板の取得に失敗しました");
  const { sections, ttlDays } = await res.json();
  writeCachedBoard(userId, sections);
  return { kind: "board", sections, ttlDays, offline: false, cachedAt: null, userId };
}
