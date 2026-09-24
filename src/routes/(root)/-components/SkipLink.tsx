import classes from "./SkipLink.module.css";

/** キーボード操作用: ヘッダーを飛ばして本文 (#main) へ移動するリンク。Tab でフォーカスしたときだけ見える */
export function SkipLink() {
  return (
    <a href="#main" className={classes.skipLink}>
      本文へ移動
    </a>
  );
}
