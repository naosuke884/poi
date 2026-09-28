import { Anchor, Text } from "@mantine/core";
import { Link } from "@tanstack/react-router";

// 狭い画面で折り返すときは「・」の所で折り、リンクの語の途中 (「プライバシーポ / リシー」) では切らない
const noWrap = { whiteSpace: "nowrap" } as const;

/** ページ下端のフッター (コピーライトと GitHub・利用規約・プライバシーポリシーへのリンク)。ランディングと規約のページで共通 (#139) */
export function SiteFooter() {
  return (
    <Text size="xs" c="dimmed" ta="center" mt="xl">
      © {new Date().getFullYear()} poi{" ・ "}
      <Anchor
        href="https://github.com/naosuke884/poi"
        target="_blank"
        rel="noopener noreferrer"
        size="xs"
        style={noWrap}
      >
        GitHub
      </Anchor>
      {" ・ "}
      <Anchor component={Link} to="/terms" size="xs" style={noWrap}>
        利用規約
      </Anchor>
      {" ・ "}
      <Anchor component={Link} to="/privacy" size="xs" style={noWrap}>
        プライバシーポリシー
      </Anchor>
    </Text>
  );
}
