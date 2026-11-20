import { useEffect, useState } from "react";

import { BottomLeftNotice } from "@/components/BottomLeftNotice";
import { Button } from "@/components/Button";
import { startGoogleLogin } from "@/lib/auth-client";

/** ヘッダーのログインボタン。ログイン専用ページは無く、押すとそのまま Google OAuth を始める */
export function LoginButton() {
  // Google へのリダイレクトが始まるまでの間、二度押しで OAuth を 2 回始めないようにする
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Google の同意画面からブラウザバックで戻ると、bfcache がページを busy=true のまま
  // 復元してボタンが押せなくなるので、復元されたときは戻す
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
    <>
      <Button size="compact" loading={busy} onClick={() => void login()}>
        Google でログインして始める
      </Button>
      {/* エラーは他の通知と同じく左下に出す (ヘッダー内だと狭くて読みにくい) */}
      {error && (
        <BottomLeftNotice
          color="red"
          role="alert"
          closeLabel="エラーを閉じる"
          onClose={() => setError(null)}
        >
          {error}
        </BottomLeftNotice>
      )}
    </>
  );
}
