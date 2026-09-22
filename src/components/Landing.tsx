import { Anchor, Box, Button, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { Link } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { startGoogleLogin } from "@/lib/auth-client";
import { MEMO_TTL_DAYS } from "@worker/memo/constants";
import classes from "./Landing.module.css";

// 特徴カード。文言は「何ができるか」だけに絞り、実装の言葉 (PWA 等) は避ける
const FEATURES: { title: string; body: string }[] = [
  {
    title: `${MEMO_TTL_DAYS} 日たつと、勝手に消える`,
    body: "セクションごとに期限が付く。日数は設定で変えられる。",
  },
  {
    title: "メモをシェアできる",
    body: "セクションごとに、テキストをコピー、もしくは、画像にして共有。",
  },
  {
    title: "見やすい",
    body: "Markdown 記法で見やすく描画。",
  },
];

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
  // OS で「動きを減らす」を選んでいる人にはデモ動画を自動再生しない (controls で再生してもらう)
  const reduceMotion = useReducedMotion();
  // Google へのリダイレクトが始まるまでの間、二度押しで OAuth を 2 回始めないようにする
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // デモ動画の拡大表示 (#54): クリックで video 要素をそのまま全画面にする。
  // 全画面の間だけ controls を出す (インラインに置くとクリックが再生操作と取り合いになる。
  // 「動きを減らす」の人の再生もここで行う)
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFullscreen, setVideoFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setVideoFullscreen(document.fullscreenElement === videoRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const zoomVideo = () => {
    const video = videoRef.current;
    // 全画面中のクリック (controls の余白など) が video からここへバブルしても再入しない
    if (!video || document.fullscreenElement) return;
    if (video.requestFullscreen) {
      void video.requestFullscreen();
    } else {
      // iPhone の Safari には requestFullscreen が無い。ネイティブの全画面プレイヤー
      // (controls 付き) を開く webkitEnterFullscreen で代える
      (video as { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
    }
  };
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
    <Stack gap={72} py="xl" align="center">
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

      {/* 実際に使う様子 (README と同じデモ動画)。音声が無いので muted で自動再生・ループにする */}
      <Box maw={860} w="100%">
        <button
          type="button"
          className={classes.videoZoomButton}
          aria-label="デモ動画を全画面で見る"
          onClick={zoomVideo}
        >
          <video
            ref={videoRef}
            src="/demo.mp4"
            className={classes.demoVideo}
            autoPlay={!reduceMotion}
            controls={videoFullscreen}
            muted
            loop
            playsInline
          />
        </button>
      </Box>

      <Stack gap="sm" maw={860} w="100%">
        <Title order={2} size="h4" ta="center">
          特徴
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" w="100%">
          {FEATURES.map((f) => (
            // 本文は通常色 (dimmed だと小さい文字でコントラスト AA を割る)
            <Paper key={f.title} withBorder radius="md" p="md">
              <Stack gap="sm">
                {/* balance: 折り返しが必要なとき「消え/る」のような不格好な位置で切らず 2 行を均等にする */}
                <Text fw={600} size="xl" ta="center" style={{ textWrap: "balance" }}>
                  {f.title}
                </Text>
                <Text size="sm" ta="center">
                  {f.body}
                </Text>
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
      </Stack>

      <Text size="xs" c="dimmed" ta="center" mt="xl">
        © {new Date().getFullYear()} poi{" ・ "}
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
