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
 * 特徴の一覧。広い画面では 2 列に並べ、各項目の上に板の区切り線と同じ細い線を引く
 * (カードや色の付いた縦線にせず、板と同じ見え方でまとまりを示す)
 */
export function FeatureList() {
  return (
    <Box component="section" aria-labelledby="features" maw={720} w="100%">
      <Title order={2} id="features" size="h3" className={classes.sectionTitle}>
        できること
      </Title>
      <Box component="ul" className={classes.features}>
        {FEATURES.map((title) => (
          <li key={title} className={classes.feature}>
            <Text component="h3" fw={600} size="lg" m={0}>
              {title}
            </Text>
          </li>
        ))}
      </Box>
    </Box>
  );
}
