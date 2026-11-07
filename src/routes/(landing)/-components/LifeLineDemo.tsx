import classes from "./Landing.module.css";
import days from "./LifeLineDemo.module.css";

/**
 * 板のセクションの寿命のバー (LifeLine) を真似た飾り。スクロールを時間の経過に見立てて、
 * 「あと N 日」が from から to まで減りバーが縮んでいく (対応ブラウザのみ。それ以外は from のまま)。
 * バーの長さは保存期間の既定値 (MEMO_TTL_DAYS) に対する割合で、板と同じ見え方にする。
 * 日数は 1 〜 MEMO_TTL_DAYS の整数 (LifeLineDemo.module.css が持つ範囲)。
 * 中身は飾りなので、読み上げからは外す。
 * 板の LifeLine を使わないのは、日数を CSS のカウンターで描かないとスクロールに合わせて減らせないため
 */
export function LifeLineDemo({ from, to }: { from: number; to: number }) {
  return (
    <div
      aria-hidden
      className={`${classes.lifeDemo} ${days.days}`}
      // 残り 1 日まで減るものだけ、板と同じく最後にオレンジにする
      data-soon={to <= 1 || undefined}
      data-from={from}
      data-to={to}
    >
      <span className={classes.lifeDemoLabel} />
      <span className={classes.lifeDemoTrack}>
        <span className={classes.lifeDemoRemaining} />
      </span>
    </div>
  );
}
