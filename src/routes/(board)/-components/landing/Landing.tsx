import { Box, Stack, Title } from "@mantine/core";
import { useLayoutEffect } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { DemoVideo } from "./DemoVideo";
import { FeatureList } from "./FeatureList";
import classes from "./Landing.module.css";
import { LandingHero } from "./LandingHero";
import { LoginCta } from "./LoginCta";

/**
 * 未ログインで / に来た人向けのランディング。何ができるか + デモ動画 + ログイン導線。
 * ログイン専用ページは無く、CTA がそのまま Google OAuth を開始する (同意文もここに置く)。
 * 読み終えたところでもう一度始められるよう、末尾にも CTA を置く
 */
export function Landing() {
  // ルーターのスクロール復元は "/" を除外している (Board が自分で末尾へ合わせるため) ので、
  // 板以外を表示するときはここで先頭に戻す (例: /terms から戻ってきた場合)
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <Stack gap={72} py="xl" align="center">
      <LandingHero />
      <DemoVideo />
      <FeatureList />
      <Box
        component="section"
        className={classes.closing}
        w="100%"
        aria-labelledby="landing-closing"
      >
        <Stack gap="xl" align="center" ta="center">
          <Title order={2} id="landing-closing" className={classes.closingTitle}>
            片付けは、時間にまかせる。
          </Title>
          <LoginCta />
        </Stack>
      </Box>
      <SiteFooter />
    </Stack>
  );
}
