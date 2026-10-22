import { Box, Title, useComputedColorScheme } from "@mantine/core";
import { useMediaQuery, useReducedMotion } from "@mantine/hooks";
import { useRef, useState } from "react";

import classes from "./Landing.module.css";

/**
 * 配色が分かるか。ビルド時のプリレンダー (Node で描画する。src/prerender.tsx。issue #157) では分からない。
 * ブラウザでは、プリレンダーした HTML はハイドレーションせずに描き直す (src/main.tsx) ので、最初から分かる
 */
const COLOR_SCHEME_KNOWN = typeof document !== "undefined";

/** スマホ版の動画を出す画面の幅 (Mantine の sm 未満)。Landing.module.css の .demoVideo の比率と揃える */
const PHONE_QUERY = "(max-width: 47.99em)";

/** 実際に使う様子 (README と同じデモ動画)。音声が無いので muted で自動再生・ループにする */
export function DemoVideo() {
  // OS で「動きを減らす」を選んでいる人にはデモ動画を自動再生しない (動画を押して再生してもらう)
  const reduceMotion = useReducedMotion();
  // ダーク配色では暗い板を撮った版を出す (明るい動画だけが浮かないように。issue #98)。
  // <source media> は再生中に配色が変わっても切り替わらないので、配色から src を選ぶ。
  // 初回の描画から実際の配色を使う (効果の後に直すと明るい版を読みかけてしまう)。
  // プリレンダーした HTML には動画もポスターも入れない (配色が分からず、明るい版を読み込ませてしまうため)。
  // 場所は aspect-ratio で取ってある
  const dark = useComputedColorScheme("light", { getInitialValueInEffect: false }) === "dark";
  // スマホの幅では、スマホの画面を撮った縦長の版を出す (PC 版を縮めると字が 4px 前後になり読めない。HAY-53)。
  // 配色と同じく初回の描画から実際の幅で選ぶ
  const phone = useMediaQuery(PHONE_QUERY, false, { getInitialValueInEffect: false });
  const suffix = `${dark ? "-dark" : ""}${phone ? "-phone" : ""}`;
  // 自動再生が始まる (または止まる) と video のイベントで追従する。「動きを減らす」では止まったまま始まる
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      // 再生できない (読み込みに失敗した等) ときは止まったままにし、ボタンの表示も変えない
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };
  return (
    // 動画は PC の画面 (1280×800、ヘッダーを含むページ全体) を撮っている (issue #138)。
    // 広い画面でもページの列 (Container md = 960px。余白を除くと 928px、0.73 倍で本文 12px 前後) に収める。
    // スマホの幅では、スマホの画面 (390×720) を撮った縦長の版を出す (scripts/record-demo-video.mjs)。
    // スクロールで画面が起き上がる飾りは付けない (動画の中で寄ったり引いたりするので、動きが重なる)
    <Box component="section" aria-labelledby="demo" maw={960} w="100%">
      {/* 見出しは本文の列 (720px) に揃える。動画だけは広い画面でその外まで広げる */}
      <Title
        order={2}
        id="demo"
        size="h3"
        maw={720}
        mx="auto"
        mb="lg"
        className={classes.sectionTitle}
      >
        実際の画面
      </Title>
      {/* 自動で動き続けるものは止められるようにする (WCAG 2.2.2)。動画の下に操作のボタンや説明は置かず
        (見た目を動画だけにする)、動画そのものを押すと止まる・動くボタンにする */}
      <button
        type="button"
        className={classes.videoButton}
        aria-label={playing ? "デモ動画を一時停止" : "デモ動画を再生"}
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          src={COLOR_SCHEME_KNOWN ? `/demo${suffix}.mp4` : undefined}
          // 読み込み中や自動再生しないとき (動きを減らす) に見せる、内容の入った板 (issue #97)。
          // 動画と同じく配色と幅に合わせる
          poster={COLOR_SCHEME_KNOWN ? `/demo-poster${suffix}.webp` : undefined}
          className={classes.demoVideo}
          autoPlay={!reduceMotion}
          muted
          loop
          playsInline
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      </button>
    </Box>
  );
}
