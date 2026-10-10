import { Box, Stack, Text, Title } from "@mantine/core";
import { MEMO_TTL_DAYS } from "@shared/constants";

import { LoginCta } from "./LoginCta";

import classes from "./Landing.module.css";

/** 見出し + 一言の説明 + ログインの CTA */
export function LandingHero() {
  return (
    <Stack gap="lg" align="center" ta="center">
      {/* ページを移ったときのフォーカス先 (#121。枠を出さないのは heroTitle で) */}
      <Title order={1} className={classes.heroTitle} tabIndex={-1}>
        {MEMO_TTL_DAYS} 日で消えるメモ帳
      </Title>
      {/* 幅は、広い画面で一文ずつ一行に収まる長さ */}
      <Text size="lg" maw={420} className={classes.heroLead}>
        書いたメモは、日がたつと自動で消えます。片付けを気にせず、思いついたまま書けます。
      </Text>
      <Box mt="lg">
        <LoginCta />
      </Box>
    </Stack>
  );
}
