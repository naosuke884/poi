import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { readCachedUser } from "@/lib/session-cache";
import { useDocumentTitle } from "@/lib/use-document-title";
import { Landing } from "./-components/Landing";

// トップ: ランディング (何ができるか + ログイン導線)。誰が開いても同じ内容にする (issue #156)。
// ログイン済みの人は板 (/board) へ転送する。Cookie があれば Worker が先に 302 で返す (worker/site/pages.ts) が、
// ホーム画面に追加した後や 2 回目以降は Service Worker が index.html を返して Worker を通らないので、ここでも転送する
export const Route = createFileRoute("/(landing)/")({
  // この端末で前回ログインしていたら、ランディングを描かずに板へ (セッション切れなら板の loader がここへ戻す)
  beforeLoad: () => {
    if (readCachedUser()) throw redirect({ to: "/board", replace: true });
  },
  component: LandingPage,
});

function LandingPage() {
  useDocumentTitle();
  const navigate = useNavigate();
  // 端末のキャッシュが無くてもログインしていることがある (キャッシュを消した等)。表示した後で確かめて板へ
  useEffect(() => {
    let cancelled = false;
    authClient
      .getSession()
      .then(({ data }) => {
        if (data && !cancelled) void navigate({ to: "/board", replace: true });
      })
      // オフラインなどで確かめられなければランディングのまま
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [navigate]);
  return <Landing />;
}
