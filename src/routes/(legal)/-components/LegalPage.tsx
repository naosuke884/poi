import { Anchor, Stack, Text, Title, Typography } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useDocumentTitle } from "@/lib/use-document-title";
import classes from "./LegalPage.module.css";

/**
 * 利用規約 / プライバシーポリシーの共通レイアウト。
 * 本文は Typography で見出し・リスト・段落の既定スタイルを当てる (ログイン不要で読める)。
 */
export function LegalPage({
  title,
  heading = title,
  updatedAt,
  children,
}: {
  /** ページ名。文書のタイトル (「利用規約 | poi」) と、heading を省いたときの見出しに使う */
  title: string;
  /** 見出しを title と変えたいときだけ渡す。長い語は折り返せる位置に <wbr /> を入れる (auto-phrase は複合語を 1 つの文節として扱うため) */
  heading?: ReactNode;
  updatedAt: string;
  children: ReactNode;
}) {
  useDocumentTitle(title);
  return (
    <Stack maw={720} mx="auto" w="100%" pb="xl">
      {/* 本文の見出し (第 N 条 = h2、26px) より大きくする (同じ大きさだと階層が平らに見える)。
          既定の h1 (34px) のままだとスマホ幅で「プライバシーポリシー」が 1 行に収まらないので、狭い画面では縮める。
          それでも折り返すときは語の途中で切らず文節の切れ目で (auto-phrase。未対応のブラウザは通常の折り返し)。
          tabIndex={-1} はページを移ったときのフォーカス先にするため (#121)。操作できる物ではないので枠は出さない */}
      <Title
        order={1}
        fz="clamp(1.75rem, 1rem + 4vw, 2.125rem)"
        style={{ wordBreak: "auto-phrase", outline: "none" }}
        tabIndex={-1}
      >
        {heading}
      </Title>
      <Text c="dimmed" size="sm">
        最終更新日: {updatedAt}
      </Text>
      <Typography className={classes.body} fz="md" lh={1.7}>
        {children}
      </Typography>
      <Anchor component={Link} to="/" size="sm">
        トップへ戻る
      </Anchor>
    </Stack>
  );
}
