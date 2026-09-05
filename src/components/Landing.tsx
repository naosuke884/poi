import { Anchor, Button, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { MEMO_TTL_DAYS } from "../../worker/memo/constants";

/**
 * 未ログインで / に来た人向けのランディング。何ができるか + スクショ + ログイン導線だけのミニマル構成。
 * ログイン専用ページは無く、CTA がそのまま Google OAuth を開始する (同意文もここに置く)
 */
export function Landing() {
  // ルーターのスクロール復元は "/" を除外している (Board が自分で末尾へ合わせるため) ので、
  // 板以外を表示するときはここで先頭に戻す (例: /terms から戻ってきた場合)
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);
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
      const { error: err } = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
      if (err) throw err;
      // 成功すると Google へ遷移するので busy は戻さない
    } catch {
      setError("ログインを開始できませんでした。接続を確認してもう一度お試しください。");
      setBusy(false);
    }
  };
  return (
    <Stack gap="xl" py="xl" align="center">
      <Stack gap="sm" align="center" ta="center">
        <Title order={1}>書いたら {MEMO_TTL_DAYS} 日で消えるメモ帳</Title>
        <Text c="dimmed" size="lg" maw={620}>
          poi は「いま書く」ためのメモ帳。開いてすぐ書けるひとつの板に、思いついたことをそのまま置いていく。
          セクションごとに {MEMO_TTL_DAYS} 日たつと自動で消えるので、残すつもりのないことほど気軽に書けます。
        </Text>
        <Button size="md" mt="xs" loading={busy} onClick={() => void login()}>
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

      <Paper withBorder radius="md" p={0} style={{ overflow: "hidden", maxWidth: 860, width: "100%" }}>
        {/* 配色に合わせたスクショを出す (width/height はロード中のレイアウトシフト防止) */}
        <picture>
          <source srcSet="/landing-board-dark.png" media="(prefers-color-scheme: dark)" />
          <img
            src="/landing-board.png"
            width={2000}
            height={1080}
            alt={`poi の画面: 1 枚の板にセクションが並び、区切り線に「あと n 日で消えます」の期限が表示されている`}
            style={{ display: "block", width: "100%", height: "auto" }}
          />
        </picture>
      </Paper>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg" maw={860} w="100%">
        {/* 本文は通常色 (dimmed だと小さい文字でコントラスト AA を割る) */}
        <Stack gap={4}>
          <Text fw={600}>開いてすぐ書ける</Text>
          <Text size="sm">
            1 枚の板に上から書くだけ。# 見出しや - 箇条書きなど、メモに要る分だけの Markdown が使えます。
          </Text>
        </Stack>
        <Stack gap={4}>
          <Text fw={600}>{MEMO_TTL_DAYS} 日で消える</Text>
          <Text size="sm">
            空行 2 つかボタンで区切ったセクションごとに期限が付き、{MEMO_TTL_DAYS}{" "}
            日後に自動で消えます。期限は区切り線にいつも見えています。
          </Text>
        </Stack>
        <Stack gap={4}>
          <Text fw={600}>身軽に持ち出せる</Text>
          <Text size="sm">
            セクションはコピーや画像化、折り畳みができ、スマホにはアプリとしてインストールも。オフラインでも読めます。
          </Text>
        </Stack>
      </SimpleGrid>

      <Text size="xs" c="dimmed" ta="center">
        オープンソースです:{" "}
        <Anchor href="https://github.com/naosuke884/poi" target="_blank" rel="noopener noreferrer" size="xs">
          GitHub
        </Anchor>
        {" ・ "}
        <Anchor component={Link} to="/terms" size="xs">
          利用規約
        </Anchor>
        {" ・ "}
        <Anchor component={Link} to="/privacy" size="xs">
          プライバシーポリシー
        </Anchor>
      </Text>
    </Stack>
  );
}
