import { Box, Text, Title } from "@mantine/core";
import { MEMO_TTL_CHOICES, MEMO_TTL_DAYS } from "@shared/constants";

import classes from "./Landing.module.css";

// 選べる保存期間の幅 (設定の選択肢と食い違わないよう定数から作る)
const TTL_RANGE = `${MEMO_TTL_CHOICES[0]}〜${MEMO_TTL_CHOICES[MEMO_TTL_CHOICES.length - 1]} 日`;

// 特徴。文言は「何ができるか」だけに絞り、実装の言葉 (PWA 等) は避ける。
// ヒーローの言い換えにならないよう、消え方の中身・まとめ・持ち出し・どこからでも開けることの順に並べる。
// 「セクション」は板の言葉なので、初めて出るところで何を指すかを添える
const FEATURES: { title: string; body: string }[] = [
  {
    title: `書いてから ${MEMO_TTL_DAYS} 日で、ひとつずつ消える`,
    body: `メモは区切ったまとまり (セクション) ごとに、書いた日から数えて消えます。書き足しても消える日は延びません。残りの日数はバーで見え、日数は ${TTL_RANGE}から選べます。`,
  },
  {
    title: "見出しごとに、まとめて読める",
    body: "見出しを付けると、同じ見出しのメモを日付をまたいで一か所に集めて表示します。箇条書きなどの Markdown も使えます。",
  },
  {
    title: "残したいものは、ワンクリックで持ち出せる",
    body: "セクションごとに、テキストをコピーしたり、画像にしたりできます。消える前に、チャットや SNS、別のメモへそのまま貼れます。",
  },
  {
    title: "ホーム画面から、すぐ書ける",
    body: "アプリのようにホーム画面に追加できます。電波がないときも、前回の内容は読めます。",
  },
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
        {FEATURES.map((f) => (
          // 本文は通常色 (dimmed だと小さい文字でコントラスト AA を割る)
          <li key={f.title} className={classes.feature}>
            <Text component="h3" fw={600} size="lg" m={0}>
              {f.title}
            </Text>
            <Text size="sm" mt={4}>
              {f.body}
            </Text>
          </li>
        ))}
      </Box>
    </Box>
  );
}
