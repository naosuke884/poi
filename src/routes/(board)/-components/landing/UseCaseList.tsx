import { Anchor, Box, Text, Title } from "@mantine/core";
import { MEMO_TTL_CHOICES, MEMO_TTL_DAYS } from "@shared/constants";
import { Link } from "@tanstack/react-router";
import classes from "./Landing.module.css";

// 使い道の例。どんなメモに向いているかを具体的に示し、その中に実際に検索されそうな語
// (消えるメモ・一時メモ・期限付きのメモ・自動で削除) が自然に入るようにする (issue #150)
const USE_CASES: { title: string; body: string }[] = [
  {
    title: "買い物リスト",
    body: "買うものを書いておき、買ったら消すだけ。消し忘れたリストも、日がたてば自動で削除されます。",
  },
  {
    title: "作業ログ・日々の記録",
    body: `毎日「# 作業ログ」の見出しで書き足せば、まとめ表示で続けて読めます。古い記録は ${MEMO_TTL_DAYS} 日で消えるので、ふり返りに要る分だけが残ります。`,
  },
  {
    title: "コピペの一時置き場",
    body: "あとで貼る URL やコマンド、送る前の文章の下書きを、一時メモとして置いておけます。使い終わっても片付けはいりません。",
  },
  {
    title: "期限付きのメモ",
    // \u00a0: 数字と「日」の間で折り返さない
    body: `再配達の受付番号や今週だけの予定など、期限のある用事のメモに。保存期間は ${MEMO_TTL_CHOICES[0]}\u00a0日から選べます。`,
  },
];

/**
 * 使い道の例 (特徴のリストと同じ見た目で並べる)。ランディングで唯一の h2 を持つ節。
 * 末尾から使い方・よくある質問のページへつなぐ
 */
export function UseCaseList() {
  return (
    <Box component="section" aria-labelledby="use-cases" maw={560} w="100%">
      <Title order={2} id="use-cases" size="h3" className={classes.sectionTitle}>
        消えるメモの使い道
      </Title>
      <Text mt="xs" mb="lg">
        残しておくほどではないけれど、しばらくは手元に置きたい。poi はそんなメモに向いています。
      </Text>
      <Box component="ul" className={classes.features}>
        {USE_CASES.map((u) => (
          // 本文は通常色 (dimmed だと小さい文字でコントラスト AA を割る)
          <li key={u.title} className={classes.feature}>
            <Text component="h3" fw={600} size="lg" m={0}>
              {u.title}
            </Text>
            <Text size="sm" mt={4}>
              {u.body}
            </Text>
          </li>
        ))}
      </Box>
      <Text size="sm" mt="xl">
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
