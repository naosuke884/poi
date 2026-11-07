import { LoginCta } from "./LoginCta";

import classes from "./Landing.module.css";

/**
 * ページ末尾のログイン導線。読み終えた人がヒーローまで戻らずに始められるようにする (HAY-53)。
 * ヘッダーにログインを出す案は採らない: 押す場所の近くに規約への同意文を添える決まりがあり、
 * 56px のヘッダーには収まらない。同意文ごと持つ LoginCta をここでもう一度使う
 */
export function ClosingCta() {
  return (
    <section aria-labelledby="closing" className={classes.closing}>
      <h2 id="closing" className={classes.sectionTitle}>
        片付けは、poi にまかせる
      </h2>
      <LoginCta />
    </section>
  );
}
