import { Box, Stack, Text, Title } from "@mantine/core";
import { MEMO_TTL_DAYS } from "@shared/constants";
import type { GoogleLogin } from "../../-lib/use-google-login";
import classes from "./Landing.module.css";
import { LoginCta } from "./LoginCta";

// 見出しの中で、一文字ずつ消えてまた現れる語
const VANISHING = [..."消える"];

/** 見出し + 一言の説明 + ログインの CTA (背景に藍の淡い光とドット) */
export function LandingHero({ googleLogin }: { googleLogin: GoogleLogin }) {
  return (
    <Box className={classes.hero} w="100%">
      <Stack gap="lg" align="center" ta="center">
        {/* ページを移ったときのフォーカス先 (#121。枠を出さないのは heroTitle で) */}
        {/* 「消える」を一文字ずつ inline-block の span にすると、読み上げの名前が「消 え る」と区切られる。
            見えない文字で別に読ませても、その前後で区切られる。名前は aria-label でひと続きに与える */}
        <Title
          order={1}
          className={classes.heroTitle}
          tabIndex={-1}
          aria-label={`${MEMO_TTL_DAYS} 日で消えるメモ帳`}
        >
          {MEMO_TTL_DAYS} 日で
          <span className={classes.vanish}>
            {VANISHING.map((ch, i) => (
              <Box component="span" key={ch} className={classes.vanishChar} style={{ "--i": i }}>
                {ch}
              </Box>
            ))}
          </span>
          メモ帳
        </Title>
        {/* 幅は、広い画面で一文ずつ一行に収まる長さ */}
        <Text size="lg" maw={420} className={classes.heroLead}>
          書いたメモは、日がたつと自動で消えます。片付けを気にせず、思いついたまま書けます。
        </Text>
        <Box mt="lg">
          <LoginCta {...googleLogin} />
        </Box>
      </Stack>
    </Box>
  );
}
