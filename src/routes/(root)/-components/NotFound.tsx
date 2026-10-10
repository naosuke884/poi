import { Anchor, Stack, Text, Title } from "@mantine/core";
import { Link } from "@tanstack/react-router";

import { useDocumentTitle } from "@/lib/use-document-title";

export function NotFound() {
  useDocumentTitle("ページが見つかりません");
  return (
    <Stack>
      {/* ページを移ったときのフォーカス先 (#121)。操作できる物ではないので枠は出さない */}
      <Title tabIndex={-1} style={{ outline: "none" }}>
        404
      </Title>
      <Text>ページが見つかりません。</Text>
      <Anchor component={Link} to="/">
        トップへ戻る
      </Anchor>
    </Stack>
  );
}
