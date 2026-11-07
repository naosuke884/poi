import { Loader } from "@/components/Loader";
import { VisuallyHidden } from "@/components/VisuallyHidden";

import { RUNNING_LABELS, type RunningAction } from "../../../-lib/use-account-actions";

/**
 * 実行中のアカウント操作 (ログアウト中… など) の表示。見た目は Loader だけで、文言は読み上げ用。
 * ライブリージョンは中身と同時に挿入されると読み上げられないことが多いので、
 * role="status" の入れ物は常にマウントしておき、文言だけを出し入れする (#125)。
 * Loader 自体は role の無い span で aria-label が読まれないので、読み上げの対象から外してある (aria-hidden)
 */
export function RunningStatus({ action }: { action: RunningAction | null }) {
  return (
    <>
      {action && <Loader size="xs" />}
      <VisuallyHidden role="status" aria-live="polite">
        {action ? RUNNING_LABELS[action] : ""}
      </VisuallyHidden>
    </>
  );
}
