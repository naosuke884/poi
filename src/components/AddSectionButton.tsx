import { Button } from "@mantine/core";
import { useBoardActions } from "@/lib/board-actions";

/**
 * ヘッダーの「セクションを追加」ボタン (PC 幅 = sm 以上のみ。狭い画面では Board の右下固定ボタン)。
 * 板を編集できるとき (Board が publishBoardActions で公開している間) だけ出す
 */
export function AddSectionButton() {
  const actions = useBoardActions();
  if (!actions) return null;
  return (
    <Button
      size="xs"
      visibleFrom="sm"
      leftSection={<PlusIcon />}
      // 編集中のエディタを blur させない (blur でレイアウトが動くとクリックが外れる。Board 内のボタンと同じ)
      onMouseDown={(e) => e.preventDefault()}
      onClick={actions.addSection}
    >
      セクションを追加
    </Button>
  );
}

function PlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5l0 14" />
      <path d="M5 12l14 0" />
    </svg>
  );
}
