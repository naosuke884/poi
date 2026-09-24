import { Stack } from "@mantine/core";
import { useLayoutEffect } from "react";
import { DemoVideo } from "./DemoVideo";
import { FeatureList } from "./FeatureList";
import { LandingFooter } from "./LandingFooter";
import { LandingHero } from "./LandingHero";

/**
 * 未ログインで / に来た人向けのランディング。何ができるか + スクショ + ログイン導線だけのミニマル構成。
 * ログイン専用ページは無く、CTA がそのまま Google OAuth を開始する (同意文もここに置く)
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
      <LandingFooter />
    </Stack>
  );
}
