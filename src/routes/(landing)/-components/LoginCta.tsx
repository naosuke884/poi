import { isInAppBrowser } from "@shared/in-app-browser";
import { Link } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/Button";
import { startGoogleLogin } from "@/lib/auth-client";
import { isStandalone } from "@/lib/install-prompt";

import classes from "./Landing.module.css";
import typography from "@/components/typography.module.css";

// UA は開いている間に変わらないので購読するものは無い
const subscribeNothing = () => () => {};

/**
 * X などのアプリ内ブラウザで開かれているか。そこでは OAuth の state cookie がコールバックに乗らず、
 * Google のログインが state_mismatch で必ず失敗する。ホーム画面から開いた iOS の PWA も UA に Safari/ が無く
 * WKWebView と同じ形になるが、アプリ内ブラウザではないので除く (PWA で照合付きのログインが通るかは
 * iPhone の実機で確かめる。HAY-42)。
 * ビルド時の描画 (landing.html) では false (ボタンを出す) にし、ブラウザで描き直したときに判定する
 */
function useInAppBrowser(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => isInAppBrowser(navigator.userAgent) && !isStandalone(),
    () => false,
  );
}

/** ログインの CTA + 規約への同意文 (同意文は押す場所の近くに添える)。アプリ内ブラウザでは代わりに開き直す案内 */
export function LoginCta() {
  return useInAppBrowser() ? <OpenInBrowserNotice /> : <LoginButton />;
}

/**
 * アプリ内ブラウザでの案内。ボタンを出しても必ず失敗するので、普通のブラウザで開き直してもらう。
 * アプリ内ブラウザから Safari / Chrome を直接開く方法は OS やアプリごとに違って確実ではないので、URL のコピーにとどめる
 */
function OpenInBrowserNotice() {
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
    <div className={classes.cta}>
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

function LoginButton() {
  // Google へのリダイレクトが始まるまでの間、二度押しで OAuth を 2 回始めないようにする
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Google の同意画面からブラウザバックで戻ると、bfcache がページを busy=true のまま
  // 復元して CTA が押せなくなるので、復元されたときは戻す
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  const login = async () => {
    setBusy(true);
    setError(null);
    try {
      await startGoogleLogin();
      // 成功すると Google へ遷移するので busy は戻さない
    } catch {
      setError("ログインを開始できませんでした。接続を確認してもう一度お試しください");
      setBusy(false);
    }
  };
  return (
    <div className={classes.cta}>
      <Button size="md" className={classes.loginButton} loading={busy} onClick={() => void login()}>
        Google でログインして始める
      </Button>
      {error && (
        <p className={`${typography.sm} ${classes.text} ${classes.error}`} role="alert">
          {error}
        </p>
      )}
      {/* 押す前の「お金はかかる？」「人に見られない？」に答える (どちらも FAQ と同じ事実) */}
      <p className={`${typography.sm} ${classes.text} ${classes.lead}`}>
        無料で使えます。書いたメモを読めるのは、ログインした本人だけです。
      </p>
      <p className={`${typography.xs} ${typography.muted} ${classes.text}`}>
        ログインすると、
        <Link to="/terms" className={`${typography.link} ${typography.underline}`}>
          利用規約
        </Link>
        と
        <Link to="/privacy" className={`${typography.link} ${typography.underline}`}>
          プライバシーポリシー
        </Link>
        に同意したものとみなします。
      </p>
    </div>
  );
}
