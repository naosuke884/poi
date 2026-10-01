import { Anchor, Group, Stack, Text } from "@mantine/core";
import { Link } from "@tanstack/react-router";

/**
 * ページ下端のフッター (GitHub・利用規約・プライバシーポリシーへのリンクとコピーライト)。ランディングと規約のページで共通 (#139)。
 * リンクの行とコピーライトの行を分け、リンクは「・」でつながず間隔で区切る: 1 行に並べると、狭い画面で
 * 「・」が行末に残ったり、リンクだけが次の行に落ちたりして見た目が崩れていた (#140)
 */
export function SiteFooter() {
  return (
    // 上に区切り線を引いて本文と分ける。幅は規約のページの本文 (720px) に揃える
    <Stack
      component="footer"
      gap="xs"
      align="center"
      w="100%"
      maw={720}
      mx="auto"
      mt="xl"
      pt="lg"
      style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
    >
      {/* 間隔 (lg = 20px) はタップの取り違えを防ぐため。折り返すときもリンクの単位で折れる */}
      <Group gap="lg" justify="center" style={{ rowGap: "var(--mantine-spacing-xs)" }}>
        <Anchor
          href="https://github.com/naosuke884/poi"
          target="_blank"
          rel="noopener noreferrer"
          size="xs"
        >
          GitHub
        </Anchor>
        <Anchor component={Link} to="/terms" size="xs">
          利用規約
        </Anchor>
        <Anchor component={Link} to="/privacy" size="xs">
          プライバシーポリシー
        </Anchor>
      </Group>
      <Text size="xs" c="dimmed">
        © {new Date().getFullYear()} poi
      </Text>
    </Stack>
  );
}
