export type SaveStatus =
  | "dirty" // 未保存の変更がある (debounce 待ち)
  | "saving"
  | "saved"
  | "offline" // オフラインで保存できなかった (入力は保持。online イベントか再試行で再送する)
  | "error";

/** 板の保存状態 (useBoardAutosave が返し、ヘッダーの SaveStatusIcon に出す) */
export type SaveState = {
  status: SaveStatus;
  errorMessage: string | null;
  /** offline / error のときに保存をやり直す */
  retry: () => void;
};

/**
 * 保存状態のうち読み上げる文言 (SaveStatusIcon の常在のライブリージョンに入れる)。
 * alert はエラー / オフライン (割り込んで伝える)、status はそこから戻って保存できたときの「保存済み」
 */
export type SaveAnnouncement = { alert: string; status: string };

export const NO_SAVE_ANNOUNCEMENT: SaveAnnouncement = { alert: "", status: "" };

/**
 * 保存状態が変わったときに読み上げる文言を決める (#113)。
 * 入力のたびに「未保存の変更があります」→「保存中…」→「保存済み」と読み上げると割り込みが続くので、
 * 読むのは意味のある変化だけにする:
 * - offline / error になったら problem (その文言) を alert に入れる。
 *   保存済みに戻るまでは残す (オフライン中の入力で dirty → offline を繰り返しても、同じ文言なので読み直さない)
 * - problem がある (またはそこから戻った直後の) 状態で saved になったら、alert を消して status に「保存済み」を入れる
 * - いつもの dirty / saving / saved では何も読まない (復帰後の「保存済み」は次の変化で黙って消す)
 *
 * 同じ入力で何度呼んでも同じ結果になる (描画のたびに呼んでよい)
 */
export function nextSaveAnnouncement(
  prev: SaveAnnouncement,
  status: SaveStatus,
  problem: string | null,
): SaveAnnouncement {
  switch (status) {
    case "offline":
    case "error":
      return { alert: problem ?? "", status: "" };
    case "saved":
      return prev.alert || prev.status ? { alert: "", status: "保存済み" } : prev;
    case "dirty":
    case "saving":
      return prev.status ? { ...prev, status: "" } : prev;
  }
}
