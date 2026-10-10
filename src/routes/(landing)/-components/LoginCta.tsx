import { Anchor, Button, Stack, Text } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { startGoogleLogin } from "@/lib/auth-client";

/** ログインの CTA + 規約への同意文 (同意文は押す場所の近くに添える) */
export function LoginCta() {
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
    <Stack gap="sm" align="center" ta="center">
      <Button size="md" mb="sm" loading={busy} onClick={() => void login()}>
        Google でログインして始める
      </Button>
      {error && (
        <Text size="sm" c="red" role="alert">
          {error}
        </Text>
      )}
      <Text c="dimmed" size="xs">
        ログインすると、
        <Anchor component={Link} to="/terms" size="xs" underline="always">
          利用規約
        </Anchor>
        と
        <Anchor component={Link} to="/privacy" size="xs" underline="always">
          プライバシーポリシー
        </Anchor>
        に同意したものとみなします。
      </Text>
    </Stack>
  );
}
