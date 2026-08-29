import { ActionIcon, Tooltip } from "@mantine/core";
import { type ReactNode, useEffect, useRef, useState } from "react";

// 結果の表示 (チェック / ×) を出しておく時間
const FEEDBACK_MS = 1500;

/**
 * セクションの区切り線に並べる「コピー」「スクショ」ボタン。
 * 押した結果は Tooltip とアイコン (チェック / ×) で短く知らせる (通知ライブラリは使わない)。
 * どちらも mousedown を止めて、編集中の Textarea を blur させない (削除ボタンと同じ)
 */
export function SectionActions({
  index,
  onCopy,
  onScreenshot,
}: {
  index: number;
  /** テキストをクリップボードへ */
  onCopy: () => Promise<void>;
  /** 画像化して届ける。戻り値は届け先 */
  onScreenshot: () => Promise<"clipboard" | "download">;
}) {
  return (
    <>
      <ActionButton
        tooltip="コピー"
        label={`セクション ${index + 1} をコピー`}
        run={async () => {
          await onCopy();
          return "コピーしました";
        }}
      >
        <CopyIcon />
      </ActionButton>
      <ActionButton
        tooltip="スクショ"
        label={`セクション ${index + 1} を画像にする`}
        run={async () => {
          const to = await onScreenshot();
          return to === "clipboard" ? "画像をコピーしました" : "画像を保存しました";
        }}
      >
        <CameraIcon />
      </ActionButton>
    </>
  );
}

type Feedback = { ok: boolean; message: string };

function ActionButton({
  tooltip,
  label,
  run,
  children,
}: {
  /** ホバーで出す短い名前 */
  tooltip: string;
  /** 読み上げ用 (どのセクションかを含む) */
  label: string;
  /** 実行して結果メッセージを返す。throw したら「失敗しました」を出す */
  run: () => Promise<string>;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(timerRef.current ?? undefined), []);

  const show = (f: Feedback) => {
    setFeedback(f);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setFeedback(null);
    }, FEEDBACK_MS);
  };

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      show({ ok: true, message: await run() });
    } catch {
      // ブラウザのエラー文言 (英語) はそのまま出さない
      show({ ok: false, message: "失敗しました" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tooltip label={feedback?.message ?? tooltip} opened={feedback ? true : undefined} withArrow>
      <ActionIcon
        variant="subtle"
        color={feedback ? (feedback.ok ? "teal" : "red") : "gray"}
        size="xs"
        aria-label={label}
        loading={busy}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void onClick()}
      >
        {feedback ? feedback.ok ? <CheckIcon /> : <XIcon /> : children}
      </ActionIcon>
    </Tooltip>
  );
}

// Tabler Icons (MIT) のアウトラインをそのまま使う (依存を増やさないためインライン)
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function CopyIcon() {
  return (
    <Svg>
      <path d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z" />
      <path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
    </Svg>
  );
}

function CameraIcon() {
  return (
    <Svg>
      <path d="M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" />
      <path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg>
      <path d="M5 12l5 5l10 -10" />
    </Svg>
  );
}

function XIcon() {
  return (
    <Svg>
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </Svg>
  );
}
