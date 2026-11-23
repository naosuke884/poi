import { DAY_MS } from "@shared/constants";

import classes from "./LifeLabel.module.css";
import typography from "@/components/typography.module.css";

type LifeProps = {
  expiresAt: string | null;
  now?: number;
};

/** 残りの日数 (切り上げ) と、もうすぐ消えるか。未保存 (期限がまだ無い) なら null */
function lifeOf({ expiresAt, now = Date.now() }: LifeProps) {
  if (expiresAt === null) return null;
  const end = new Date(expiresAt).getTime();
  const left = Math.max(0, end - now);
  // 期限は日単位で付くので切り上げ (残り 5 時間でも「あと 1 日」)
  const days = Math.ceil(left / DAY_MS);
  return { days, soon: days <= 1 };
}

/**
 * セクションの寿命の文字 (カードの上の行の左端)。「あと N 日」、残り 1 日以下はオレンジ。
 * 未保存のセクションは「新しいセクション」
 */
export function LifeLabel(props: LifeProps) {
  const life = lifeOf(props);
  if (!life) {
    return (
      <p className={`${typography.xs} ${typography.muted} ${classes.label}`}>新しいセクション</p>
    );
  }
  return (
    <p
      className={`${typography.xs} ${life.soon ? classes.soon : typography.muted} ${classes.label} ${classes.days}`}
    >
      あと {life.days} 日
    </p>
  );
}
