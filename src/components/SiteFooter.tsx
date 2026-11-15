import { Link } from "@tanstack/react-router";

import { ContactLink, OPERATOR_NAME, OPERATOR_URL, SOURCE_URL } from "./ContactLink";

import classes from "./SiteFooter.module.css";

/**
 * ページ下端のフッター。ランディングと文章のページで共通 (#139)。
 * リンクは「・」でつながず間隔で区切る: 1 行に並べると、狭い画面で「・」が行末に残ったり、
 * リンクだけが次の行に落ちたりして見た目が崩れていた (#140)。
 * 同じ理由で、行は内容で分けて固定する: 1 行目に案内 (使い方・よくある質問・GitHub)、
 * 2 行目に規約類とコピーライト、3 行目に運営者と問い合わせ先 (HAY-222)。
 * 1 行にまとめると、狭い画面では末尾の項目だけが次の行に残る。
 */
export function SiteFooter() {
  return (
    <footer className={classes.footer}>
      <div className={classes.row}>
        <Link to="/guide" className={classes.link}>
          使い方
        </Link>
        <Link to="/faq" className={classes.link}>
          よくある質問
        </Link>
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className={classes.link}>
          GitHub
        </a>
      </div>
      <div className={classes.row}>
        <Link to="/terms" className={classes.link}>
          利用規約
        </Link>
        <Link to="/privacy" className={classes.link}>
          プライバシーポリシー
        </Link>
        <p className={classes.copyright}>© {new Date().getFullYear()} poi</p>
      </div>
      {/* ラベルと値は一つの塊にし、狭い画面ではこの境目で折り返す。
          メールアドレスだけが次の行に残ると、問い合わせ先だと分からなくなる */}
      <address className={classes.contact}>
        <p className={classes.meta}>
          運営者{" "}
          <a href={OPERATOR_URL} target="_blank" rel="noopener noreferrer" className={classes.link}>
            {OPERATOR_NAME}
          </a>
        </p>
        <p className={classes.meta}>
          問い合わせ先 <ContactLink className={classes.link} />
        </p>
      </address>
    </footer>
  );
}
