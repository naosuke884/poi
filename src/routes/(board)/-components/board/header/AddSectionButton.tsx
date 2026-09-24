import { Button } from "@mantine/core";
import { keepEditorFocus } from "../../../-lib/keep-editor-focus";
import { PlusIcon } from "../PlusIcon";

/**
 * ヘッダーの「セクションを追加」ボタン (PC 幅 = sm 以上のみ。狭い画面では Board の右下固定ボタン)。
 * Board が編集できるときだけ HeaderSlot に出す
 */
export function AddSectionButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      size="xs"
      visibleFrom="sm"
      leftSection={<PlusIcon size={16} />}
      onMouseDown={keepEditorFocus}
      onClick={onClick}
    >
      セクションを追加
    </Button>
  );
}
