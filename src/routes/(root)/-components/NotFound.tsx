import { Link } from "@tanstack/react-router";

import { buttonClass } from "@/components/Button";
import { SiteFooter } from "@/components/SiteFooter";
import { useDocumentTitle } from "@/lib/use-document-title";

import classes from "./NotFound.module.css";

/**
 * 知らないパスを開いたときのページ (ルートの notFoundComponent。Worker は index.html を 404 で返す)。
 * ランディングのヒーローと同じく中央に寄せ、トップへ戻るボタンと、使い方などへ移れるフッターを置く
 */
export function NotFound() {
  useDocumentTitle("ページが見つかりません");
  return (
    <div className={classes.page}>
      <div className={classes.content}>
        <p className={classes.code}>404</p>
        {/* 見出しは番号でなく何が起きたかにする (読み上げで「404」とだけ聞いても分からない) */}
        <h1 className={classes.title} tabIndex={-1}>
          ページが見つかりません
        </h1>
        <p className={classes.description}>
          URL が間違っているか、ページが移動または削除された可能性があります。
        </p>
        {/* 次にできることは一つなのでボタンにする。板の主な操作と同じく light で控えめに */}
        <Link to="/" className={buttonClass({ variant: "light", className: classes.back })}>
          トップへ戻る
        </Link>
      </div>
      {/* トップ以外 (使い方・よくある質問など) へも移れるように */}
      <SiteFooter />
    </div>
  );
}
