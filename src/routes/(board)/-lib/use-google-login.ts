import { useEffect, useState } from "react";
import { startGoogleLogin } from "@/lib/auth-client";

/**
 * ランディングのログイン (Google OAuth の開始) と、その実行中・失敗の状態。
 * ヒーローの CTA とヘッダーのログインボタンで一つを共有する (どちらから押しても二度押しを防ぎ、失敗は CTA の下に出す)
 */
export function useGoogleLogin() {
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
  return { busy, error, login };
}

export type GoogleLogin = ReturnType<typeof useGoogleLogin>;
