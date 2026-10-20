import { Stack } from "@mantine/core";

import { SiteFooter } from "@/components/SiteFooter";

import { ClosingCta } from "./ClosingCta";
import { DemoVideo } from "./DemoVideo";
import { FeatureList } from "./FeatureList";
import { LandingHero } from "./LandingHero";
import { UseCaseList } from "./UseCaseList";

/**
 * トップ (/) のランディング。何ができるか + 消えていく板の見本 + デモ動画 + 特徴 + 末尾のログイン導線。
 * ログイン専用ページは無く、CTA がそのまま Google OAuth を開始する (同意文もここに置く)。
 * 見本 (使い道) をヒーローの直後に置き、「消える」をまず見せる (HAY-53)
 */
export function Landing() {
  return (
    <Stack gap={88} py="xl" align="center">
      <LandingHero />
      <UseCaseList />
      <DemoVideo />
      <FeatureList />
      <ClosingCta />
      <SiteFooter />
    </Stack>
  );
}
