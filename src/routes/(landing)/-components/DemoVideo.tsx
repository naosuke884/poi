import { Box, useComputedColorScheme } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";

import classes from "./Landing.module.css";

/**
 * 配色が分かるか。ビルド時のプリレンダー (Node で描画する。src/prerender.tsx。issue #157) では分からない。
 * ブラウザでは、プリレンダーした HTML はハイドレーションせずに描き直す (src/main.tsx) ので、最初から分かる
 */
const COLOR_SCHEME_KNOWN = typeof document !== "undefined";

/** 実際に使う様子 (README と同じデモ動画)。音声が無いので muted で自動再生・ループにする */
export function DemoVideo() {
  // OS で「動きを減らす」を選んでいる人にはデモ動画を自動再生しない (controls で再生してもらう)
  const reduceMotion = useReducedMotion();
  // ダーク配色では暗い板を撮った版を出す (明るい動画だけが浮かないように。issue #98)。
  // <source media> は再生中に配色が変わっても切り替わらないので、配色から src を選ぶ。
  // 初回の描画から実際の配色を使う (効果の後に直すと明るい版を読みかけてしまう)。
  // プリレンダーした HTML には動画もポスターも入れない (配色が分からず、明るい版を読み込ませてしまうため)。
  // 場所は aspect-ratio で取ってある
  const dark = useComputedColorScheme("light", { getInitialValueInEffect: false }) === "dark";
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
    // iPhone の Safari には requestFullscreen が無い。ネイティブの全画面プレイヤー
    // (controls 付き) を開く webkitEnterFullscreen で代える
    const enterNative = () =>
      (video as { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
    if (video.requestFullscreen) {
      // 全画面が許可されていない (iframe 内など) と reject される。代わりを試し、それも無ければその場で見てもらう
      video.requestFullscreen().catch(() => {
        try {
          enterNative();
        } catch {
          // 全画面にできない。インラインの再生のまま
        }
      });
    } else {
      enterNative();
    }
  };
  return (
    // 動画は PC の画面 (1280×800、ヘッダーを含むページ全体) を撮っている (issue #138)。
    // 広い画面でもページの列 (Container md = 960px。余白を除くと 928px、0.73 倍で本文 12px 前後) に収める。
    // スマホでは小さく映るので、クリックで全画面 (横向き) にして見てもらう。
    // videoStage は奥行き (perspective) だけを持ち、傾きと光はボタン側 (Landing.module.css)
    <Box maw={960} w="100%" className={classes.videoStage}>
      <button
        type="button"
        className={classes.videoZoomButton}
        aria-label="デモ動画を全画面で見る"
        onClick={zoomVideo}
      >
        <video
          ref={videoRef}
          src={COLOR_SCHEME_KNOWN ? (dark ? "/demo-dark.mp4" : "/demo.mp4") : undefined}
          // 読み込み中や自動再生しないとき (動きを減らす) に見せる、内容の入った板 (issue #97)。
          // 動画と同じく配色に合わせる
          poster={
            COLOR_SCHEME_KNOWN ? (dark ? "/demo-poster-dark.webp" : "/demo-poster.webp") : undefined
          }
          className={classes.demoVideo}
          autoPlay={!reduceMotion}
          controls={videoFullscreen}
          muted
          loop
          playsInline
        />
      </button>
    </Box>
  );
}
