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
