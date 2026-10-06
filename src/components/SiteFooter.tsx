import { Anchor, type AnchorProps, Group, Stack, Text } from "@mantine/core";
import { Link } from "@tanstack/react-router";

// フッターのリンクの見た目。本文より目立たせないよう dimmed (AA に引き上げ済み) にし、
// 12px の文字でもタップしやすいよう上下の余白で当たり判定を 24px 以上にする
const linkProps: AnchorProps = { size: "xs", c: "dimmed", py: 6, display: "inline-block" };

/**
 * ページ下端のフッター (使い方・よくある質問・GitHub・利用規約・プライバシーポリシーへのリンクとコピーライト)。ランディングと文章のページで共通 (#139)。
 * リンクは「・」でつながず間隔で区切る: 1 行に並べると、狭い画面で「・」が行末に残ったり、
 * リンクだけが次の行に落ちたりして見た目が崩れていた (#140)。
 * 同じ理由で、行は内容で分けて固定する: 1 行目に案内 (使い方・よくある質問・GitHub)、2 行目に規約類とコピーライト。
 * 1 行にまとめると、リンクが増えたいま狭い画面ではプライバシーポリシーだけが次の行に残っていた
 */
export function SiteFooter() {
  return (
    // 上に区切り線を引いて本文と分ける。幅は規約のページの本文 (720px) に揃える
    <Stack
      component="footer"
      gap={0}
      align="center"
      w="100%"
      maw={720}
      mx="auto"
      mt="xl"
      pt="md"
      style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
    >
      {/* 間隔 (lg = 20px) はタップの取り違えを防ぐため。折り返すときもリンクの単位で折れる */}
      <Group gap="lg" justify="center" style={{ rowGap: 0 }}>
        <Anchor component={Link} to="/guide" {...linkProps}>
          使い方
        </Anchor>
        <Anchor component={Link} to="/faq" {...linkProps}>
          よくある質問
        </Anchor>
        <Anchor
          href="https://github.com/naosuke884/poi"
          target="_blank"
          rel="noopener noreferrer"
          {...linkProps}
        >
          GitHub
        </Anchor>
      </Group>
      <Group gap="lg" justify="center" style={{ rowGap: 0 }}>
        <Anchor component={Link} to="/terms" {...linkProps}>
          利用規約
        </Anchor>
        <Anchor component={Link} to="/privacy" {...linkProps}>
          プライバシーポリシー
        </Anchor>
        <Text size="xs" c="dimmed">
          © {new Date().getFullYear()} poi
        </Text>
      </Group>
    </Stack>
  );
}
