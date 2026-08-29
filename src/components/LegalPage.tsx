import { Anchor, Stack, Text, Title, Typography } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

// 問い合わせ・削除依頼の窓口 (GitHub Issues)。セルフホストする場合は自分のリポジトリに差し替える
export const CONTACT_URL = "https://github.com/naosuke884/poi/issues";

/**
 * 利用規約 / プライバシーポリシーの共通レイアウト。
 * 本文は Typography で見出し・リスト・段落の既定スタイルを当てる (ログイン不要で読める)。
 */
export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <Stack maw={720} mx="auto" w="100%" pb="xl">
      <Title order={1} size="h2">
        {title}
      </Title>
      <Text c="dimmed" size="sm">
        最終更新日: {updatedAt}
      </Text>
      <Typography fz="md" lh={1.7}>
        {children}
      </Typography>
      <Anchor component={Link} to="/" size="sm">
        トップへ戻る
      </Anchor>
    </Stack>
  );
}
