import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/SiteFooter";
import { useDocumentTitle } from "@/lib/use-document-title";

import classes from "./DocPage.module.css";
import typography from "@/components/typography.module.css";

/**
 * 文章だけのページ (利用規約 / プライバシーポリシー / 使い方 / よくある質問) の共通レイアウト。
 * 本文は prose.module.css で見出し・リスト・段落の既定スタイルを当てる (ログイン不要で読める)。
 */
export function DocPage({
  title,
  heading = title,
  updatedAt,
  children,
}: {
  /** ページ名。文書のタイトル (「利用規約 | poi」) と、heading を省いたときの見出しに使う */
  title: string;
  /** 見出しを title と変えたいときだけ渡す。長い語は折り返せる位置に <wbr /> を入れる (auto-phrase は複合語を 1 つの文節として扱うため) */
  heading?: ReactNode;
  /** 最終更新日。規約のように改定の日付が意味を持つページだけ渡す */
  updatedAt?: string;
  children: ReactNode;
}) {
  useDocumentTitle(title);
  return (
    <div className={classes.page}>
      <h1 className={classes.title} tabIndex={-1}>
        {heading}
      </h1>
      {updatedAt && <p className={classes.updatedAt}>最終更新日: {updatedAt}</p>}
      <div className={classes.body}>{children}</div>
      <Link to="/" className={`${typography.link} ${typography.sm}`}>
        トップへ戻る
      </Link>
      {/* 文章のページからも他のページ (規約、GitHub など) へ移れるように (#139) */}
      <SiteFooter />
    </div>
  );
}
