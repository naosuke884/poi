import { Box, Text } from "@mantine/core";
import { MEMO_TTL_CHOICES, MEMO_TTL_DAYS } from "@shared/constants";
import classes from "./Landing.module.css";

// 選べる保存期間の幅 (設定の選択肢と食い違わないよう定数から作る)
const TTL_RANGE = `${MEMO_TTL_CHOICES[0]}〜${MEMO_TTL_CHOICES[MEMO_TTL_CHOICES.length - 1]} 日`;

// 特徴。文言は「何ができるか」だけに絞り、実装の言葉 (PWA 等) は避ける。
// ヒーローの言い換えにならないよう、消え方の中身・まとめ・共有・どこからでも開けることの順に並べる
const FEATURES: { title: string; body: string }[] = [
  {
    title: `書いてから ${MEMO_TTL_DAYS} 日で、ひとつずつ消える`,
    body: `消えるのはセクションごとです。残りの日数はバーで見えるので、消える前に気づけます。日数は ${TTL_RANGE}から選べます。`,
  },
  {
    title: "見出しごとに、まとめて読める",
    body: "見出しを付けると、同じ見出しのメモを日付をまたいで一か所に集めて表示します。箇条書きなどの Markdown も使えます。",
  },
  {
    title: "コピーも画像も、ワンクリック",
    body: "セクションごとに、テキストをコピーしたり、画像にしたりできます。チャットや SNS にそのまま貼れます。",
  },
  {
    title: "ホーム画面から、すぐ書ける",
    body: "アプリのようにホーム画面に追加できます。電波がないときも、前回の内容は読めます。",
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
