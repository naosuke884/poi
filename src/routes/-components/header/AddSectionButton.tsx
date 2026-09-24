import { Button } from "@mantine/core";
import { useBoardActions } from "../../-lib/board-actions";
import { keepEditorFocus } from "../../-lib/keep-editor-focus";
import { PlusIcon } from "../PlusIcon";

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
      leftSection={<PlusIcon size={16} />}
      onMouseDown={keepEditorFocus}
      onClick={actions.addSection}
    >
      セクションを追加
    </Button>
  );
}
