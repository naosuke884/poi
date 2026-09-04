import { Anchor, Button, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { MEMO_TTL_DAYS } from "../../worker/memo/constants";

/**
 * 未ログインで / に来た人向けのランディング。何ができるか + スクショ + ログイン導線だけのミニマル構成。
 * ログインの実処理 (OAuth 開始・規約への同意文) は /login に任せ、ここからは誘導するだけ
 */
export function Landing() {
  return (
    <Stack gap="xl" py="xl" align="center">
      <Stack gap="sm" align="center" ta="center">
        <Title order={1}>書いたら {MEMO_TTL_DAYS} 日で消えるメモ帳</Title>
        <Text c="dimmed" size="lg" maw={620}>
          poi は「いま書く」ためのメモ帳。開いてすぐ書けるひとつの板に、思いついたことをそのまま置いていく。
          セクションごとに {MEMO_TTL_DAYS} 日たつと自動で消えるので、残すつもりのないことほど気軽に書けます。
        </Text>
        <Button component={Link} to="/login" size="md" mt="xs">
          Google でログインして始める
        </Button>
      </Stack>

      <Paper withBorder radius="md" p={0} style={{ overflow: "hidden", maxWidth: 860, width: "100%" }}>
        <img
          src="/landing-board.png"
          alt={`poi の画面: 1 枚の板にセクションが並び、区切り線に「あと n 日で消えます」の期限が表示されている`}
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      </Paper>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg" maw={860} w="100%">
        <Stack gap={4}>
          <Text fw={600}>開いてすぐ書ける</Text>
          <Text size="sm" c="dimmed">
            1 枚の板に上から書くだけ。# 見出しや - 箇条書きなど、メモに要る分だけの Markdown が使えます。
          </Text>
        </Stack>
        <Stack gap={4}>
          <Text fw={600}>{MEMO_TTL_DAYS} 日で消える</Text>
          <Text size="sm" c="dimmed">
            空行 2 つかボタンで区切ったセクションごとに期限が付き、{MEMO_TTL_DAYS}{" "}
            日後に自動で消えます。期限は区切り線にいつも見えています。
          </Text>
        </Stack>
        <Stack gap={4}>
          <Text fw={600}>身軽に持ち出せる</Text>
          <Text size="sm" c="dimmed">
            セクションはコピーや画像化、折り畳みができ、スマホにはアプリとしてインストールも。オフラインでも読めます。
          </Text>
        </Stack>
      </SimpleGrid>

      <Text size="xs" c="dimmed" ta="center">
        オープンソースです:{" "}
        <Anchor href="https://github.com/naosuke884/poi" target="_blank" rel="noopener noreferrer" size="xs">
          GitHub
        </Anchor>
        {" ・ "}
        <Anchor component={Link} to="/terms" size="xs">
          利用規約
        </Anchor>
        {" ・ "}
        <Anchor component={Link} to="/privacy" size="xs">
          プライバシーポリシー
        </Anchor>
      </Text>
    </Stack>
  );
}
