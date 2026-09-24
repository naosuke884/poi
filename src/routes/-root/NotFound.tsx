import { Anchor, Stack, Text, Title } from "@mantine/core";
import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <Stack>
      <Title>404</Title>
      <Text>ページが見つかりません。</Text>
      <Anchor component={Link} to="/">
        トップへ戻る
      </Anchor>
    </Stack>
  );
}
