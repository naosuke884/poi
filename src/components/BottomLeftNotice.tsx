import { Affix, Notification, type NotificationProps } from "@mantine/core";

import { affixInset } from "@/lib/affix";

/**
 * 閉じるボタンの読み上げ名。複数の通知が出ていても区別できるよう、タイトルが文字列ならそれを含める
 * (「「更新があります」を閉じる」)。タイトルが無い / 文字列でないときは closeLabel か「通知を閉じる」
 */
function noticeCloseLabel(title: NotificationProps["title"], closeLabel?: string) {
  if (closeLabel) return closeLabel;
  return typeof title === "string" && title ? `「${title}」を閉じる` : "通知を閉じる";
}

/**
 * 画面の左下 (広い画面では板の左端) に固定で出す通知 (削除の取り消し・操作のエラー・更新のお知らせ)。
 * ホームインジケータ / ノッチ (safe-area) の分だけ内側に寄せる。右下は板の追加ボタンが使う。
 * raised は左下角の通知 (削除の取り消しなど) と重ならないよう、その上の段に出す。
 *
 * 読み上げは既定で role="status" (読み上げ中の内容に割り込まない)。Mantine の既定は role="alert" なので
 * ここで上書きする。エラーは呼び出し側で role="alert" を明示する。
 * closeLabel はタイトルの無い通知 (エラーなど) の閉じるボタンの読み上げ名
 */
export function BottomLeftNotice({
  raised = false,
  onClose,
  closeLabel,
  role = "status",
  ...props
}: Omit<NotificationProps, "withBorder" | "closeButtonProps"> & {
  raised?: boolean;
  onClose: () => void;
  closeLabel?: string;
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
        closeButtonProps={{ "aria-label": noticeCloseLabel(props.title, closeLabel) }}
        role={role}
        {...props}
      />
    </Affix>
  );
}
