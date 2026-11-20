import { Link } from "@tanstack/react-router";

import { ContactLink } from "./ContactLink";

import classes from "./SiteFooter.module.css";

/**
 * ページ下端のフッター。ランディングと文章のページで共通 (#139)。
 * リンクは「・」でつながず間隔で区切る: 「・」でつなぐと、狭い画面で「・」が行末に残って見た目が崩れていた (#140)。
 * 読む順 (ドキュメント → 規約類 → 問い合わせ) に 1 行で並べ、狭い画面では項目の単位で折り返す。
 * 運営者の名前は規約とプライバシーポリシーに書いてある (HAY-222)
 */
export function SiteFooter() {
  return (
    <footer className={classes.footer}>
      <Link to="/docs/guide" className={classes.link}>
        ドキュメント
      </Link>
      <Link to="/terms" className={classes.link}>
        利用規約
      </Link>
      <Link to="/privacy" className={classes.link}>
        プライバシーポリシー
      </Link>
      <ContactLink className={classes.link}>問い合わせ</ContactLink>
    </footer>
  );
}
