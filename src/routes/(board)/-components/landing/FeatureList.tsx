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

/**
 * 特徴の短いリスト (カードにせず左揃え。見出しは付けない: 内容だけで特徴だと分かる)。
 * 対応ブラウザでは、スクロールに合わせて一つずつ浮かび上がる (Landing.module.css の .feature)
 */
export function FeatureList() {
  return (
    <Box component="ul" className={classes.features} maw={560} w="100%">
      {FEATURES.map((f, i) => (
        // 本文は通常色 (dimmed だと小さい文字でコントラスト AA を割る)
        <li key={f.title} className={classes.feature}>
          <Text fw={600} size="lg">
            {f.title}
          </Text>
          <Text size="sm" mt={4}>
            {f.body}
          </Text>
          {i === 0 && <LifeLineDemo />}
        </li>
      ))}
    </Box>
  );
}

/**
 * 板のセクションの寿命のバー (LifeLine) を真似た飾り。スクロールを時間の経過に見立てて、
 * 「あと N 日」が減りバーが縮んでいく (対応ブラウザのみ。それ以外は満タンのまま)。
 * 中身は上の文の繰り返しなので、読み上げからは外す
 */
function LifeLineDemo() {
  return (
    <Box
      aria-hidden
      className={classes.lifeDemo}
      mt="sm"
      // 減り始める日数 (保存期間の既定値)。数え方は CSS のカウンターで描く
      style={{ "--life-demo-days": MEMO_TTL_DAYS }}
    >
      <span className={classes.lifeDemoLabel} />
      <span className={classes.lifeDemoTrack}>
        <span className={classes.lifeDemoRemaining} />
      </span>
    </Box>
  );
}
