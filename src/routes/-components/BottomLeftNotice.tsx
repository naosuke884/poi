import { Affix, Notification, type NotificationProps } from "@mantine/core";
import { affixInset } from "../-lib/affix";

/**
 * 画面の左下 (広い画面では板の左端) に固定で出す通知 (削除の取り消し・操作のエラー・更新のお知らせ)。
 * ホームインジケータ / ノッチ (safe-area) の分だけ内側に寄せる。右下は板の追加ボタンが使う。
 * raised は左下角の通知 (削除の取り消しなど) と重ならないよう、その上の段に出す
 */
export function BottomLeftNotice({
  raised = false,
  onClose,
  ...props
}: Omit<NotificationProps, "withBorder" | "closeButtonProps"> & {
  raised?: boolean;
  onClose: () => void;
}) {
  return (
    <Affix
      position={{
        bottom: `calc(${raised ? 72 : 16}px + env(safe-area-inset-bottom))`,
        left: affixInset("left"),
      }}
    >
      <Notification
        withBorder
        onClose={onClose}
        closeButtonProps={{ "aria-label": "閉じる" }}
        {...props}
      />
    </Affix>
  );
}
