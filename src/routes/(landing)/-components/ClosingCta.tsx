import { Stack, Text, Title } from "@mantine/core";

import { LoginCta } from "./LoginCta";

import classes from "./Landing.module.css";

/**
 * ページ末尾のログイン導線。読み終えた人がヒーローまで戻らずに始められるようにする (HAY-53)。
 * 一言は「大事なメモまで消えてしまわない？」に答える (ヒーローの「日がたつと消える」の繰り返しにしない)。
 * ヘッダーにログインを出す案は採らない: 押す場所の近くに規約への同意文を添える決まりがあり、
 * 56px のヘッダーには収まらない。同意文ごと持つ LoginCta をここでもう一度使う
 */
export function ClosingCta() {
  return (
    // 上に余白を足し、特徴の一覧から一段離して締めくくりに見せる
    <Stack
      component="section"
      aria-labelledby="closing"
      gap="lg"
      align="center"
      ta="center"
      pt="xl"
    >
      <Title order={2} id="closing" size="h3" className={classes.sectionTitle}>
        片付けは、poi にまかせる
      </Title>
      <Text maw={420} className={classes.lead}>
        消える前の日には残りの日数がオレンジになります。残したいメモは、コピーや画像にして持ち出せます。
      </Text>
      <LoginCta />
    </Stack>
  );
}
