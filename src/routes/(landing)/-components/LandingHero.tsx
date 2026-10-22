import { Box, Stack, Text, Title } from "@mantine/core";
import { MEMO_TTL_DAYS } from "@shared/constants";

import { HeroMemo } from "./HeroMemo";
import { LoginCta } from "./LoginCta";

import classes from "./Landing.module.css";

/** 見出し + 一言の説明 + ログインの CTA + 消えていくメモの見本 */
export function LandingHero() {
  return (
    <Stack gap="lg" align="center" ta="center">
      {/* ページを移ったときのフォーカス先 (#121。枠を出さないのは heroTitle で) */}
      <Title order={1} className={classes.heroTitle} tabIndex={-1}>
        {MEMO_TTL_DAYS} 日で消えるメモ帳
      </Title>
      {/* 本質の一文だけにする (片付けがいらないことは、下の見本と使い道で見せる。HAY-53) */}
      <Text size="lg" className={classes.lead}>
        書いたメモは、日がたつと自動で消えます。
      </Text>
      <Box mt="lg">
        <LoginCta />
      </Box>
      <HeroMemo />
    </Stack>
  );
}
