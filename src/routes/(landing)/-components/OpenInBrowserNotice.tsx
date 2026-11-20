import { useState } from "react";

import { Button } from "@/components/Button";

import classes from "./Landing.module.css";
import typography from "@/components/typography.module.css";

/**
 * アプリ内ブラウザでの案内。ログインボタン (ヘッダー) を出しても必ず失敗するので、普通のブラウザで開き直してもらう。
 * アプリ内ブラウザから Safari / Chrome を直接開く方法は OS やアプリごとに違って確実ではないので、URL のコピーにとどめる
 */
export function OpenInBrowserNotice() {
  const [copyResult, setCopyResult] = useState<string>("");
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/`);
      setCopyResult("URL をコピーしました。Safari や Chrome に貼り付けて開いてください");
    } catch {
      setCopyResult("コピーできませんでした。画面のメニューから「ブラウザで開く」を選んでください");
    }
  };
  return (
    <div className={classes.notice}>
      <p className={`${classes.text} ${classes.inAppNote}`}>
        アプリ内のブラウザでは Google でログインできません。Safari や Chrome
        などのブラウザで開いてください。
      </p>
      <Button size="md" className={classes.copyButton} onClick={() => void copyUrl()}>
        URL をコピー
      </Button>
      {/* 結果を読み上げるため、空のときも置いておく */}
      <p className={`${typography.sm} ${classes.text}`} role="status">
        {copyResult}
      </p>
    </div>
  );
}
