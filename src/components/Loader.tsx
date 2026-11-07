import type { CSSProperties } from "react";

import classes from "./Loader.module.css";

/** 処理中を示す回るリング。役割を持たないので、読み上げる文言は呼び出し側のライブリージョンに置く */
export function Loader({
  size = "md",
  color,
  className,
}: {
  size?: "xs" | "sm" | "md";
  /** 既定は藍。ボタンの中では currentColor にして文字色に合わせる */
  color?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-loader=""
      className={[classes.loader, size !== "md" && classes[size], className]
        .filter(Boolean)
        .join(" ")}
      style={color ? ({ "--loader-color": color } as CSSProperties) : undefined}
    />
  );
}
