import { Link } from "@tanstack/react-router";

import classes from "./SiteFooter.module.css";

/**
 * ページ下端のフッター (使い方・よくある質問・GitHub・利用規約・プライバシーポリシーへのリンクとコピーライト)。ランディングと文章のページで共通 (#139)。
 * リンクは「・」でつながず間隔で区切る: 1 行に並べると、狭い画面で「・」が行末に残ったり、
 * リンクだけが次の行に落ちたりして見た目が崩れていた (#140)。
 * 同じ理由で、行は内容で分けて固定する: 1 行目に案内 (使い方・よくある質問・GitHub)、2 行目に規約類とコピーライト。
 * 1 行にまとめると、リンクが増えたいま狭い画面ではプライバシーポリシーだけが次の行に残っていた
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
        <a
          href="https://github.com/naosuke884/poi"
          target="_blank"
          rel="noopener noreferrer"
          className={classes.link}
        >
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
    </footer>
  );
}
