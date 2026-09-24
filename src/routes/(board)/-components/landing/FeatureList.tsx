import { Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { MEMO_TTL_DAYS } from "@shared/constants";

// 特徴カード。文言は「何ができるか」だけに絞り、実装の言葉 (PWA 等) は避ける
const FEATURES: { title: string; body: string }[] = [
  {
    title: `${MEMO_TTL_DAYS} 日たつと、勝手に消える`,
    body: "セクションごとに期限が付く。日数は設定で変えられる。",
  },
  {
    title: "メモをシェアできる",
    body: "セクションごとに、テキストをコピー、もしくは、画像にして共有。",
  },
  {
    title: "見やすい",
    body: "Markdown 記法で見やすく描画。",
  },
];

export function FeatureList() {
  return (
    <Stack gap="sm" maw={860} w="100%">
      <Title order={2} size="h4" ta="center">
        特徴
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" w="100%">
        {FEATURES.map((f) => (
          // 本文は通常色 (dimmed だと小さい文字でコントラスト AA を割る)
          <Paper key={f.title} withBorder radius="md" p="md">
            <Stack gap="sm">
              {/* balance: 折り返しが必要なとき「消え/る」のような不格好な位置で切らず 2 行を均等にする */}
              <Text fw={600} size="xl" ta="center" style={{ textWrap: "balance" }}>
                {f.title}
              </Text>
              <Text size="sm" ta="center">
                {f.body}
              </Text>
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
