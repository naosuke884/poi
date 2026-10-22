import { Anchor, Box, Text, Title } from "@mantine/core";
import { Link } from "@tanstack/react-router";

import { LifeLineDemo } from "./LifeLineDemo";

import classes from "./Landing.module.css";

// 使い道の例。どんなメモに向いているかを具体的に示し、その中に実際に検索されそうな語
// (消えるメモ・一時メモ・期限付きのメモ・自動で削除) が自然に入るようにする (issue #150)。
// 本文は一行に絞り、検索語は残す (ページ全体で説明を本質だけにする。HAY-53)。
// 板のセクションに見立てて並べ、それぞれ残りの日数を変えて「書いた日が違えば消える日も違う」と見せる。
// from / to はスクロールで減っていく日数 (買い物リストと期限付きのメモは、残り 1 日まで減ってオレンジになる)
const USE_CASES: { title: string; body: string; from: number; to: number }[] = [
  {
    title: "買い物リスト",
    body: "買い終えたら放っておくだけ。日がたてば自動で削除されます。",
    from: 6,
    to: 1,
  },
  {
    title: "作業ログ・日々の記録",
    body: "同じ見出しで書き足せば、日付をまたいでまとめて読めます。",
    from: 28,
    to: 21,
  },
  {
    title: "コピペの一時置き場",
    body: "あとで貼る URL や下書きを、一時メモとして置いておけます。",
    from: 15,
    to: 9,
  },
  {
    title: "期限付きのメモ",
    body: "再配達の番号など、期限のある用事に。最短 1 日で消せます。",
    from: 4,
    to: 1,
  },
];

/**
 * 使い道の例を、板のセクション (寿命のバー + 見出し + 本文) に見立てて並べる。
 * スクロールに合わせて各セクションの残り日数が減り、「消える」ことをページの中で見せる (HAY-53)。
 * 末尾から使い方・よくある質問のページへつなぐ
 */
export function UseCaseList() {
  return (
    <Box component="section" aria-labelledby="use-cases" maw={720} w="100%">
      <Title order={2} id="use-cases" size="h3" className={classes.sectionTitle}>
        消えるメモの使い道
      </Title>
      <Box component="ul" className={classes.mockBoard}>
        {USE_CASES.map((u) => (
          <li key={u.title}>
            <LifeLineDemo from={u.from} to={u.to} />
            <Text component="h3" className={classes.mockHeading}>
              {u.title}
            </Text>
            {/* 板の本文と同じ大きさと行送り */}
            <Text fz="md" lh={1.7}>
              {u.body}
            </Text>
          </li>
        ))}
      </Box>
      <Text size="sm" mt="xl" className={classes.lead}>
        くわしくは
        <Anchor component={Link} to="/guide" size="sm" underline="always">
          使い方
        </Anchor>
        と
        <Anchor component={Link} to="/faq" size="sm" underline="always">
          よくある質問
        </Anchor>
        をご覧ください。
      </Text>
    </Box>
  );
}
