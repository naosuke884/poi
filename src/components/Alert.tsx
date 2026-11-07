import { type HTMLAttributes, type ReactNode } from "react";

import classes from "./Alert.module.css";

/**
 * 画面上部の案内。既定の役割は role="alert" (読み上げを割り込ませる)。
 * 常にマウントしたライブリージョンの中に置くとき (OfflineBanner など) は role="note" を渡して二重の読み上げを避ける (#126)
 */
export function Alert({
  tone,
  title,
  className,
  children,
  role = "alert",
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  tone: "attention" | "danger";
  title?: ReactNode;
}) {
  return (
    <div
      role={role}
      className={[classes.alert, classes[tone], className].filter(Boolean).join(" ")}
      {...props}
    >
      <div className={classes.body}>
        {title && <div className={classes.title}>{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}
