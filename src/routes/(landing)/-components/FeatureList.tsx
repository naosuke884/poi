import { Box, Text, Title } from "@mantine/core";
import { MEMO_TTL_DAYS } from "@shared/constants";

import classes from "./Landing.module.css";

// 特徴。「何ができるか」の一行だけにし、実装の言葉 (PWA 等) は避ける。
// 細かい決まり (保存期間の幅、Markdown、オフライン) は使い方とよくある質問のページに任せる (HAY-53)。
// ヒーローの言い換えにならないよう、消え方の中身・まとめ・持ち出し・どこからでも開けることの順に並べる
const FEATURES = [
  `書いてから ${MEMO_TTL_DAYS} 日で、ひとつずつ消える`,
  "見出しごとに、まとめて読める",
  "残したいものは、ワンクリックで持ち出せる",
  "ホーム画面から、すぐ書ける",
];

/**
 * 特徴の一覧。一行ずつの短い箇条書きにする (見出し + 本文のまとまりにすると、本文の無い今は
 * 区切り線と見出しだけが並んで表の枠のように見える。HAY-53)
 */
export function FeatureList() {
  return (
    <Box component="section" aria-labelledby="features" maw={720} w="100%">
      <Title order={2} id="features" size="h3" className={classes.sectionTitle}>
        できること
      </Title>
      <Box component="ul" className={classes.features}>
        {FEATURES.map((feature) => (
          <Text component="li" key={feature} size="lg" className={classes.feature}>
            {feature}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
