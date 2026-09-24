import { createExternalStore } from "@/lib/external-store";

export type BoardActions = {
  /** 末尾に空のセクションを足してカーソルを置く */
  addSection: () => void;
};

/**
 * 板の操作をヘッダー (AddSectionButton) に伝えるための小さなストア。
 * Board (編集できるときだけ) が publishBoardActions で書き、ヘッダーが useBoardActions で読む。
 * null は「板を編集していない」(別ページ、または閲覧のみ) で、ヘッダーにはボタンを出さない
 */
const store = createExternalStore<BoardActions | null>(null, () => null);

export function publishBoardActions(next: BoardActions | null) {
  store.set(next);
}

export function useBoardActions(): BoardActions | null {
  return store.useValue();
}
