import { type HTMLAttributes, type ReactNode } from "react";

import { affixInset } from "@/lib/affix";

import { Affix } from "./Affix";
import { CloseButton } from "./IconButton";

import classes from "./BottomLeftNotice.module.css";

/**
 * 閉じるボタンの読み上げ名。複数の通知が出ていても区別できるよう、タイトルが文字列ならそれを含める
 * (「「更新があります」を閉じる」)。タイトルが無い / 文字列でないときは closeLabel か「通知を閉じる」
 */
function noticeCloseLabel(title: ReactNode, closeLabel?: string) {
  if (closeLabel) return closeLabel;
  return typeof title === "string" && title ? `「${title}」を閉じる` : "通知を閉じる";
}

/**
 * 画面の左下 (広い画面では板の左端) に固定で出す通知 (削除の取り消し・操作のエラー・更新のお知らせ)。
 * ホームインジケータ / ノッチ (safe-area) の分だけ内側に寄せる。右下は板の追加ボタンが使う。
 * raised は左下角の通知 (削除の取り消しなど) と重ならないよう、その上の段に出す。
 * color="red" は左端の帯を赤にする (エラー)。
 *
 * 読み上げは既定で role="status" (読み上げ中の内容に割り込まない)。エラーは呼び出し側で role="alert" を明示する。
 * closeLabel はタイトルの無い通知 (エラーなど) の閉じるボタンの読み上げ名。
 * 本文 (children) に置くボタンの上の余白は呼び出し側で付ける (本文が文だけのときは要らないので)
 */
export function BottomLeftNotice({
  raised = false,
  onClose,
  closeLabel,
  role = "status",
  title,
  color,
  children,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "title" | "color"> & {
  title?: ReactNode;
  color?: "red";
  raised?: boolean;
  onClose: () => void;
  closeLabel?: string;
}) {
  return (
    <Affix
      style={{
        bottom: `calc(${raised ? 72 : 16}px + env(safe-area-inset-bottom))`,
        insetInlineStart: affixInset("left"),
      }}
    >
      <div
        role={role}
        className={[classes.notice, color === "red" && classes.red, className]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        <div className={classes.body}>
          {title && <div className={classes.title}>{title}</div>}
          <div className={classes.description} data-with-title={title ? true : undefined}>
            {children}
          </div>
        </div>
        <CloseButton
          className={classes.close}
          aria-label={noticeCloseLabel(title, closeLabel)}
          onClick={onClose}
        />
      </div>
    </Affix>
  );
}
