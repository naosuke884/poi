import { Box, Text } from "@mantine/core";
import { MEMO_TTL_DAYS } from "@shared/constants";
import classes from "./Landing.module.css";

// 特徴。文言は「何ができるか」だけに絞り、実装の言葉 (PWA 等) は避ける
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
    title: "Markdown で整えて書ける",
    body: "見出しや箇条書きを Markdown で書くと、整って表示される。",
  },
];

/** 特徴の短いリスト (カードにせず左揃え。見出しは付けない: 内容だけで特徴だと分かる) */
export function FeatureList() {
  return (
    <Box component="ul" className={classes.features} maw={560} w="100%">
      {FEATURES.map((f) => (
        // 本文は通常色 (dimmed だと小さい文字でコントラスト AA を割る)
        <li key={f.title}>
          <Text fw={600} size="lg">
            {f.title}
          </Text>
          <Text size="sm" mt={4}>
            {f.body}
          </Text>
        </li>
      ))}
    </Box>
  );
}
