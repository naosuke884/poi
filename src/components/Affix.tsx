import { type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import classes from "./Affix.module.css";

/**
 * 画面に固定で置く入れ物 (右下の追加ボタン・左下の通知)。位置は style の inset で指定する
 * (affixInset と safe-area を使う)。
 * body へのポータルに出す: 祖先に transform や contain があると position: fixed が画面ではなくその要素に
 * 対して効いてしまうため。読み上げや Tab の順は DOM の末尾になる (キーボードで削除したときは Board が
 * 「元に戻す」へフォーカスを移す)
 */
export function Affix({
  style,
  className,
  children,
}: {
  style: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={[classes.affix, className].filter(Boolean).join(" ")} style={style}>
      {children}
    </div>,
    document.body,
  );
}
