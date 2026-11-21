import { DAY_MS } from "@shared/constants";
import type { CSSProperties, ReactNode } from "react";

import classes from "./LifeLine.module.css";
import typography from "@/components/typography.module.css";

/**
 * セクションの区切り線を兼ねた寿命のバー (issue #95)。
 * 線そのものは全幅の薄い線 (セクションの境界)。その上に、残りの期間の割合だけ濃い線を左から重ねる
 * (書いた直後は全幅、消える直前はほぼ 0)。左端に「あと N 日」。残り 1 日以下はオレンジにして、もうすぐ消えると分かるようにする。
 * 未保存のセクション (期限がまだ無い) は線と「新しいセクション」だけ
 */
export function LifeLine({
  createdAt,
  expiresAt,
  now = Date.now(),
}: {
  createdAt: string | null;
  expiresAt: string | null;
  now?: number;
}) {
  if (createdAt === null || expiresAt === null) {
    return (
      <div className={classes.line}>
        <p className={`${typography.xs} ${typography.muted} ${classes.label}`}>新しいセクション</p>
        <Track />
      </div>
    );
  }
  const end = new Date(expiresAt).getTime();
  const total = end - new Date(createdAt).getTime();
  const left = Math.max(0, end - now);
  // 期限は日単位で付くので切り上げ (残り 5 時間でも「あと 1 日」)
  const days = Math.ceil(left / DAY_MS);
  const ratio = total > 0 ? Math.min(1, left / total) : 0;
  const soon = days <= 1;
  const color = soon ? "var(--poi-color-warning)" : "var(--poi-color-text-muted)";
  return (
    <div className={classes.line}>
      <p
        className={`${typography.xs} ${soon ? classes.soon : typography.muted} ${classes.label} ${classes.days}`}
      >
        あと {days} 日
      </p>
      <Track>
        <div
          aria-hidden
          className={classes.remaining}
          // 長さと色だけ渡し、描き方は LifeLine.module.css に置く
          style={
            { "--life-line-ratio": `${ratio * 100}%`, "--life-line-color": color } as CSSProperties
          }
        />
      </Track>
    </div>
  );
}

/** 全幅の薄い線。子に残りの期間の濃い線を重ねる */
function Track({ children }: { children?: ReactNode }) {
  return (
    <div aria-hidden className={classes.track}>
      {children}
    </div>
  );
}
