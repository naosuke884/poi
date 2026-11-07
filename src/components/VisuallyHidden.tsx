import { type HTMLAttributes } from "react";

import classes from "./VisuallyHidden.module.css";

/** 読み上げだけに出す文字。ライブリージョン (role="status") や画面に出さない見出しに使う */
export function VisuallyHidden({
  as: Tag = "span",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: "span" | "div" | "h1" | "h2" }) {
  return <Tag className={[classes.hidden, className].filter(Boolean).join(" ")} {...props} />;
}
