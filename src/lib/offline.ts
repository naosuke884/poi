// オフライン判定まわりの小さなヘルパー。
// fetch はサーバに到達できないとき (機内モード等) に TypeError で reject する。
// それを OfflineError に揃えて、loader / エディタ / 削除などで「オフライン」として扱えるようにする。

/** ネットワークに到達できずリクエストが送れなかったことを表すエラー */
export class OfflineError extends Error {
  constructor(message = "オフラインです") {
    super(message);
    this.name = "OfflineError";
  }
}

/** navigator.onLine が false なら確実にオフライン (true は「不明」なので当てにしない) */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** fetch が投げるネットワークエラー (TypeError) か、navigator.onLine が false なら true */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof OfflineError) return true;
  if (isOffline()) return true;
  return e instanceof TypeError;
}

/**
 * API 呼び出しを実行し、ネットワークエラーなら OfflineError に変換して投げ直す。
 * サーバからのレスポンス (4xx / 5xx) はそのまま返すので、呼び出し側で status を見る。
 */
export async function fetchOrOffline<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (e) {
    if (isNetworkError(e)) throw new OfflineError();
    throw e;
  }
}
