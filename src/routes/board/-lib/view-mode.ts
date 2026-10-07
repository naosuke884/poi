import { useState } from "react";

/** 板の表示モード。timeline は通常の板 (編集可)、organized は見出しごとにまとめた表示 (閲覧のみ) */
export type BoardViewMode = "timeline" | "organized";

// 最後に選んだモード。コンポーネントの外に置くのは、オンライン復帰やページの移動で Board が
// 作り直されても選んだモードを保つため
let lastMode: BoardViewMode = "timeline";

/** 表示モードとその切替 (Board が持ち、ヘッダーの ViewToggle には props で渡す) */
export function useViewMode() {
  const [mode, setMode] = useState(lastMode);
  const set = (next: BoardViewMode) => {
    lastMode = next;
    setMode(next);
  };
  return [mode, set] as const;
}
