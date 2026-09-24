import { api } from "@/lib/api";
import { fetchOrOffline, OfflineError } from "@/lib/offline";
import { clearOfflineCaches } from "@/lib/offline-caches";
import type { BoardSection } from "./board";
import { readCachedBoard, writeCachedBoard } from "./board-cache";
import type { LoginContext } from "./optional-login";

/** トップ (/) に出すもの: 未ログインならランディング、ログイン済みなら板 */
export type TopPage =
  | { kind: "landing" }
  | {
      kind: "board";
      sections: BoardSection[];
      /** sections の時点の板の版 (保存時に送る。一度も保存されていない / オフラインのキャッシュ表示では null) */
      revision: string | null;
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
  // 取得した内容が最新だったと言える時刻 (キャッシュを古い内容で上書きしないため。writeCachedBoard)
  const requestedAt = Date.now();
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
    // 保存期間 (ttlDays) はキャッシュしていないので不明。版も持たない (キャッシュ表示は閲覧のみで保存しない)
    return {
      kind: "board",
      sections: cached.sections,
      revision: null,
      ttlDays: undefined,
      offline: true,
      cachedAt: cached.cachedAt,
      userId,
    };
  }
  if (res.status === 401) {
    clearOfflineCaches();
    return { kind: "landing" };
  }
  if (!res.ok) throw new Error("板の取得に失敗しました");
  const { sections, revision, ttlDays } = await res.json();
  writeCachedBoard(userId, sections, requestedAt);
  return { kind: "board", sections, revision, ttlDays, offline: false, cachedAt: null, userId };
}
