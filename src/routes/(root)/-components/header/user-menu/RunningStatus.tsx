import { Loader, VisuallyHidden } from "@mantine/core";

import { RUNNING_LABELS, type RunningAction } from "../../../-lib/use-account-actions";

/**
 * 実行中のアカウント操作 (ログアウト中… など) の表示。見た目は Loader だけで、文言は読み上げ用。
 * ライブリージョンは中身と同時に挿入されると読み上げられないことが多いので、
 * role="status" の入れ物は常にマウントしておき、文言だけを出し入れする (#125)。
 * Loader 自体は role の無い span で aria-label が読まれないので aria-hidden にする
 */
export function RunningStatus({ action }: { action: RunningAction | null }) {
  return (
    <>
      {action && <Loader size="xs" aria-hidden />}
      <VisuallyHidden role="status" aria-live="polite">
        {action ? RUNNING_LABELS[action] : ""}
      </VisuallyHidden>
    </>
  );
}
