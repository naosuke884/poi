import { Stack } from "@mantine/core";
import { SiteFooter } from "@/components/SiteFooter";
import { DemoVideo } from "./DemoVideo";
import { FeatureList } from "./FeatureList";
import { LandingHero } from "./LandingHero";
import { UseCaseList } from "./UseCaseList";

/**
 * トップ (/) のランディング。何ができるか + デモ動画 + 使い道の例 + ログイン導線。
 * ログイン専用ページは無く、CTA がそのまま Google OAuth を開始する (同意文もここに置く)
 */
export function Landing() {
  return (
    <Stack gap={72} py="xl" align="center">
      <LandingHero />
      <DemoVideo />
      <FeatureList />
      <UseCaseList />
      <SiteFooter />
    </Stack>
  );
}
