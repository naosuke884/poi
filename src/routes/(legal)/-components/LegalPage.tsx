import { Anchor, Stack, Text, Title, Typography } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import classes from "./LegalPage.module.css";

/**
 * 利用規約 / プライバシーポリシーの共通レイアウト。
 * 本文は Typography で見出し・リスト・段落の既定スタイルを当てる (ログイン不要で読める)。
 */
export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  /** 長い語は折り返せる位置に <wbr /> を入れて渡す (auto-phrase は複合語を 1 つの文節として扱うため) */
  title: ReactNode;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <Stack maw={720} mx="auto" w="100%" pb="xl">
      {/* 本文の見出し (第 N 条 = h2、26px) より大きくする (同じ大きさだと階層が平らに見える)。
          既定の h1 (34px) のままだとスマホ幅で「プライバシーポリシー」が 1 行に収まらないので、狭い画面では縮める。
          それでも折り返すときは語の途中で切らず文節の切れ目で (auto-phrase。未対応のブラウザは通常の折り返し) */}
      <Title
        order={1}
        fz="clamp(1.75rem, 1rem + 4vw, 2.125rem)"
        style={{ wordBreak: "auto-phrase" }}
      >
        {title}
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
