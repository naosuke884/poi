import { type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";

import { Loader } from "./Loader";

import classes from "./Button.module.css";

export type ButtonVariant = "filled" | "light" | "default" | "outline-danger";
export type ButtonSize = "xs" | "compact" | "sm" | "md";

const VARIANT_CLASS: Record<ButtonVariant, string | undefined> = {
  filled: undefined,
  light: classes.light,
  default: classes.default,
  "outline-danger": classes.outlineDanger,
};
const SIZE_CLASS: Record<ButtonSize, string | undefined> = {
  xs: classes.xs,
  compact: classes.compact,
  sm: undefined,
  md: classes.md,
};

export interface ButtonStyle {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** ボタンのクラス名。リンクをボタンの見た目にするとき (<Link className={buttonClass({ variant: "light" })}>) に使う */
export function buttonClass({
  variant = "filled",
  size = "sm",
  fullWidth = false,
  className,
}: ButtonStyle = {}) {
  return [
    classes.button,
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    fullWidth && classes.full,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyle {
  /** 処理中。押せなくなり、スピナーを出す (文字は幅を保つため薄く残す) */
  loading?: boolean;
  /** 文字の前に置くアイコン */
  leftSection?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant,
  size,
  fullWidth,
  className,
  loading = false,
  leftSection,
  disabled,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      data-loading={loading || undefined}
      {...props}
    >
      <span className={classes.label}>
        {leftSection && <span className={classes.section}>{leftSection}</span>}
        {children}
      </span>
      {loading && (
        <span className={classes.spinner}>
          <Loader size="sm" color="currentColor" />
        </span>
      )}
    </button>
  );
}
