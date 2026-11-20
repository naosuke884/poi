import { MEMO_TTL_DAYS } from "@shared/constants";

import { useInAppBrowser } from "@/lib/use-in-app-browser";

import { OpenInBrowserNotice } from "./OpenInBrowserNotice";

import classes from "./Landing.module.css";

/** 見出し。ログインのボタンはヘッダーにある (アプリ内ブラウザでは、代わりに開き直す案内をここに出す) */
export function LandingHero() {
  const inAppBrowser = useInAppBrowser();
  return (
    <div className={classes.hero}>
      {/* ページを移ったときのフォーカス先 (#121。枠を出さないのは heroTitle で) */}
      <h1 className={classes.heroTitle} tabIndex={-1}>
        {MEMO_TTL_DAYS} 日で消えるメモ帳
      </h1>
      {inAppBrowser && <OpenInBrowserNotice />}
    </div>
  );
}
