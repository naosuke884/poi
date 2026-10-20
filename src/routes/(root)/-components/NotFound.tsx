import { Button, Stack, Text, Title } from "@mantine/core";
import { Link } from "@tanstack/react-router";

import { SiteFooter } from "@/components/SiteFooter";
import { useDocumentTitle } from "@/lib/use-document-title";

/**
 * 知らないパスを開いたときのページ (ルートの notFoundComponent。Worker は index.html を 404 で返す)。
 * ランディングのヒーローと同じく中央に寄せ、トップへ戻るボタンと、使い方などへ移れるフッターを置く
 */
export function NotFound() {
  useDocumentTitle("ページが見つかりません");
  return (
    // 内容を画面の縦の中ほどに置き、フッターは下端へ (Container が縦の flex で画面の下まで伸びている)
    <Stack gap={0} py="xl" style={{ flex: 1 }}>
      <Stack gap="md" align="center" ta="center" justify="center" style={{ flex: 1 }}>
        {/* 番号は飾りに近いので目立たせない (大きな文字なので dimmed でもコントラストは足りる) */}
        <Text c="dimmed" fw={700} lh={1} fz="clamp(3rem, 2rem + 6vw, 4.5rem)">
          404
        </Text>
        {/* 見出しは番号でなく何が起きたかにする (読み上げで「404」とだけ聞いても分からない)。
            既定の h1 (34px) だと番号と張り合うので、ドキュメントのページと同じ大きさまで縮める。
            tabIndex={-1} はページを移ったときのフォーカス先にするため (#121)。操作できる物ではないので枠は出さない */}
        <Title
          order={1}
          fz="clamp(1.5rem, 1rem + 2vw, 1.75rem)"
          style={{ wordBreak: "auto-phrase", outline: "none" }}
          tabIndex={-1}
        >
          ページが見つかりません
        </Title>
        <Text maw={420} style={{ textWrap: "pretty", wordBreak: "auto-phrase" }}>
          URL が間違っているか、ページが移動または削除された可能性があります。
        </Text>
        {/* 次にできることは一つなのでボタンにする。板の主な操作と同じく light で控えめに */}
        <Button component={Link} to="/" variant="light" mt="sm">
          トップへ戻る
        </Button>
      </Stack>
      {/* トップ以外 (使い方・よくある質問など) へも移れるように */}
      <SiteFooter />
    </Stack>
  );
}
