import { Anchor, Box, Text, Title } from "@mantine/core";
import { MEMO_TTL_DAYS } from "@shared/constants";
import { Link } from "@tanstack/react-router";

import { LifeLineDemo } from "./LifeLineDemo";

import classes from "./Landing.module.css";

// 使い道の例。どんなメモに向いているかを具体的に示し、その中に実際に検索されそうな語
// (消えるメモ・一時メモ・期限付きのメモ・自動で削除) が自然に入るようにする (issue #150)。
// 板のセクションに見立てて並べ、それぞれ残りの日数を変えて「書いた日が違えば消える日も違う」と見せる。
// from / to はスクロールで減っていく日数 (買い物リストと期限付きのメモは、残り 1 日まで減ってオレンジになる)
const USE_CASES: { title: string; body: string; from: number; to: number }[] = [
  {
    title: "買い物リスト",
    body: "買うものを書いておき、買ったら消すだけ。消し忘れたリストも、日がたてば自動で削除されます。",
    from: 6,
    to: 1,
  },
  {
    title: "作業ログ・日々の記録",
    body: `毎日「作業ログ」という見出しで書き足せば、まとめ表示で続けて読めます。古い記録は ${MEMO_TTL_DAYS} 日で消えるので、ふり返りに要る分だけが残ります。`,
    from: 28,
    to: 21,
  },
  {
    title: "コピペの一時置き場",
    body: "あとで貼る URL やコマンド、送る前の文章の下書きを、一時メモとして置いておけます。使い終わっても片付けはいりません。",
    from: 15,
    to: 9,
  },
  {
    title: "期限付きのメモ",
    body: "再配達の受付番号や今週だけの予定など、期限のある用事のメモに。保存期間は最短 1 日にできます。",
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
      <Text mt="xs" className={classes.lead}>
        残しておくほどではないけれど、しばらくは手元に置きたい。poi はそんなメモに向いています。
      </Text>
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
