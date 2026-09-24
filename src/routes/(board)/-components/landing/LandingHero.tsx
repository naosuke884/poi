import { Anchor, Button, Stack, Text, Title } from "@mantine/core";
import { MEMO_TTL_DAYS } from "@shared/constants";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { startGoogleLogin } from "@/lib/auth-client";
import classes from "./Landing.module.css";

/** 見出し + ログインの CTA + 規約への同意文 */
export function LandingHero() {
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
      <Title order={1} className={classes.heroTitle}>
        {MEMO_TTL_DAYS} 日で消えるメモ帳
      </Title>
      <Button size="md" mt={40} mb="lg" loading={busy} onClick={() => void login()}>
        Google でログインして始める
      </Button>
      {error && (
        <Text size="sm" c="red" role="alert">
          {error}
        </Text>
      )}
      <Text c="dimmed" size="xs">
        ログインすると、
        <Anchor component={Link} to="/terms" size="xs">
          利用規約
        </Anchor>
        と
        <Anchor component={Link} to="/privacy" size="xs">
          プライバシーポリシー
        </Anchor>
        に同意したものとみなします。
      </Text>
    </Stack>
  );
}
