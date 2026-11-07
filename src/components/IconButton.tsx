import { type ButtonHTMLAttributes, type Ref } from "react";

import { Loader } from "./Loader";

import classes from "./IconButton.module.css";

export type IconButtonSize = "xs" | "sm" | "md" | "xl";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * filled: 藍で塗る (右下の追加ボタン)。subtle: 面なし、ホバーで薄い面 (ヘッダーや区切り線の小さなボタン)。
   * アイコンだけのボタンなので、必ず aria-label を付ける
   */
  variant?: "filled" | "subtle";
  /** subtle の文字とホバーの色 */
  color?: "gray" | "orange" | "red";
  /** 一辺の大きさ: xs 18px / sm 22px / md 28px / xl 44px */
  size?: IconButtonSize;
  /** 角を丸くしきる (円形) */
  round?: boolean;
  /** 処理中。押せなくなり、アイコンの代わりにスピナーを出す */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * アイコンだけのボタン。アイコンの色だけを変えたいとき (区切り線のボタンの dimmed / 結果の色) は、
 * className で --icon-button-icon-color を指定する (color の色を残すのは、ホバーの面まで色付きにしないため)
 */
export function IconButton({
  variant = "filled",
  color = "gray",
  size = "md",
  round = false,
  loading = false,
  disabled,
  className,
  type = "button",
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={[
        classes.root,
        classes[variant],
        variant === "subtle" && classes[color],
        classes[size],
        round && classes.round,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || loading}
      data-loading={loading || undefined}
      {...props}
    >
      {loading && (
        <span className={classes.loaderBox} aria-hidden="true">
          <Loader className={classes.loader} color="var(--icon-button-color)" />
        </span>
      )}
      <span className={classes.icon}>{children}</span>
    </button>
  );
}

/**
 * × の閉じるボタン (通知を閉じる・区切り線の削除)。IconButton と違って枠線を持たない
 * (区切り線の削除ボタンの当たり判定 SectionActions.module.css はこの大きさから測っている)。
 * 色・ホバーの面・× の大きさは className で --close-button-color / --close-button-hover / --close-icon-size
 * を指定する (× の既定は一辺の 70%)
 */
export function CloseButton({
  size = "md",
  className,
  type = "button",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  size?: IconButtonSize;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      type={type}
      className={[classes.close, classes[size], className].filter(Boolean).join(" ")}
      {...props}
    >
      <CloseIcon />
    </button>
  );
}

// 形は Mantine の CloseIcon (MIT) から写したもの。Tabler の x にしないのは、線の太さと端の形が変わって閉じるボタンの見た目が変わるため
function CloseIcon() {
  return (
    <svg
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={classes.closeIcon}
    >
      <path
        d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}
