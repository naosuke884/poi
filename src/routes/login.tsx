import { Anchor, Button, Paper, Stack, Text, Title } from "@mantine/core";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { isNetworkError } from "@/lib/offline";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: async ({ search }) => {
    // オフラインで getSession の fetch 自体が失敗したら未ログイン扱いでフォームを出す
    // (ランディングの CTA から来られるので、ここで throw するとエラーページで行き止まりになる。
    //  ログインボタンを押せば既存のエラーメッセージが状況を伝える)
    let data: Awaited<ReturnType<typeof authClient.getSession>>["data"] | null = null;
    try {
      ({ data } = await authClient.getSession());
    } catch (e) {
      if (!isNetworkError(e)) throw e;
    }
    if (data) throw redirect({ to: search.redirect ?? "/" });
  },
  component: Login,
});

function Login() {
  const { redirect: redirectTo } = Route.useSearch();
  // Google へのリダイレクトが始まるまでの間、二度押しで OAuth を 2 回始めないようにする
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await authClient.signIn.social({
        provider: "google",
        callbackURL: redirectTo ?? "/",
      });
      if (err) throw err;
      // 成功すると Google へ遷移するので busy は戻さない
    } catch {
      setError("ログインを開始できませんでした。接続を確認してもう一度お試しください。");
      setBusy(false);
    }
  };
  return (
    <Paper withBorder p="xl" maw={400} mx="auto" mt="xl">
      <Stack>
        {/* ページの見出し (h1)。大きさは h2 相当に抑える */}
        <Title order={1} size="h2">
          ログイン
        </Title>
        <Text c="dimmed" size="sm">
          Google アカウントでログインします。
        </Text>
        <Button loading={busy} onClick={() => void login()}>
          Google でログイン
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
    </Paper>
  );
}
