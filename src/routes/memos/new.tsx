import { Anchor, Stack, Text, Title } from "@mantine/core";
import { createFileRoute, Link } from "@tanstack/react-router";
import { requireLogin } from "@/lib/require-login";

// メモ作成画面のプレースホルダー。編集画面は #4 で実装する
// (一覧の「新規作成」リンクが型チェックを通るよう、ルートだけ先に用意している)
export const Route = createFileRoute("/memos/new")({
  beforeLoad: ({ location }) => requireLogin(location),
  component: NewMemo,
});

function NewMemo() {
  return (
    <Stack>
      <Title order={2}>新規メモ</Title>
      <Text c="dimmed">編集画面は準備中です。</Text>
      <Anchor component={Link} to="/">
        一覧へ戻る
      </Anchor>
    </Stack>
  );
}
