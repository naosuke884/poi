import { SiteFooter } from "@/components/SiteFooter";

import { FeatureSections } from "./FeatureSections";
import { LandingHero } from "./LandingHero";

import classes from "./Landing.module.css";

/**
 * トップ (/) のランディング。何ができるか + 特徴の節。
 * ログイン専用ページは無く、ヘッダーのボタンがそのまま Google OAuth を開始する
 */
export function Landing() {
  return (
    <div className={classes.page}>
      <LandingHero />
      <FeatureSections />
      <SiteFooter />
    </div>
  );
}
