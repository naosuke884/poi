import type { TagIcon } from "@shared/constants";
import { type ReactNode, type Ref, useEffect, useRef, useState } from "react";

import { CloseButton, IconButton } from "@/components/IconButton";
import { Tooltip } from "@/components/Tooltip";
import { VisuallyHidden } from "@/components/VisuallyHidden";

import { keepEditorFocus } from "../../../-lib/keep-editor-focus";
import { CheckIcon, Svg, XIcon } from "../TablerIcon";
import { TagIconSvg } from "../TagIcon";

import classes from "./SectionActions.module.css";

// 結果の表示 (チェック / ×) を出しておく時間
const FEEDBACK_MS = 1500;

/**
 * セクションのカードの上の行に並べる「コピー」「スクショ」ボタン。
 * 押した結果は Tooltip とアイコン (チェック / ×) で短く知らせる (通知ライブラリは使わない)。
 * 読み上げ用には同じ文言を隠しテキストのライブリージョンに出す。
 * どちらも mousedown を止めて、編集中のエディタを blur させない (削除ボタンと同じ)
 */
export function SectionActions({
  subject,
  onCopy,
  onScreenshot,
}: {
  /** 読み上げ用の対象の名前 (「セクション 3」) */
  subject: string;
  /** テキストをクリップボードへ */
  onCopy: () => Promise<void>;
  /** 画像化して届ける。戻り値は届け先 */
  onScreenshot: () => Promise<"clipboard" | "download">;
}) {
  return (
    <>
      <ActionButton
        tooltip="コピー"
        label={`${subject} をコピー`}
        run={async () => {
          await onCopy();
          return "コピーしました";
        }}
      >
        <CopyIcon />
      </ActionButton>
      <ActionButton
        tooltip="スクショ"
        label={`${subject} を画像にする`}
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

/**
 * カードの上の行の右端の削除ボタン (セクション)。押した後の「元に戻す」は Board の通知に任せる。
 * mousedown を止めて、編集中のエディタを blur させない
 */
export function SectionDeleteButton({
  subject,
  onDelete,
}: {
  /** 読み上げ用の対象の名前 (SectionActions と同じ) */
  subject: string;
  /** viaKeyboard はキーボード (や支援技術) で押した (click の detail が 0。マウスやタップなら 1 以上) */
  onDelete: (viaKeyboard: boolean) => void;
}) {
  return (
    <Tooltip label="削除" withArrow>
      <CloseButton
        size="xs"
        className={`${classes.touchTarget} ${classes.delete}`}
        aria-label={`${subject} を削除`}
        onMouseDown={keepEditorFocus}
        onClick={(e) => onDelete(e.detail === 0)}
      />
    </Tooltip>
  );
}

/**
 * 上の行のタグのボタン。押すとタグを選ぶ欄 (SectionTags) が開き、もう一度押すと閉じる。
 * タグが付いていればそのタグのアイコン (名前はツールチップ)、付いていなければ控えめな色のタグのアイコンにする:
 * 付いているタグを見せる場所と変える入口を 1 つにまとめる (別々に置くと、もう 1 行要る)。
 * 名前を並べないのは、上の行を狭くしないため (長い名前はスマホでボタンを押し出す)。
 * mousedown を止めるのは他のボタンと同じ (先にエディタが blur すると、レイアウトが動いてクリックが外れる)。
 * 欄が開くとフォーカスはそちらへ移る
 */
export function SectionTagButton({
  subject,
  tag,
  icon,
  expanded,
  onClick,
  ref,
}: {
  /** 読み上げ用の対象の名前 (SectionActions と同じ) */
  subject: string;
  /** 付いているタグ (無ければ null) */
  tag: string | null;
  /** 付いているタグのアイコン (分からなければ undefined。other の形になる) */
  icon: TagIcon | undefined;
  /** タグを選ぶ欄が開いているか */
  expanded: boolean;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  // タグの有無で見た目は変えるが、要素は同じ <button> のまま描き変える: 別の要素にすると、タグを付けた /
  // 外した拍子にボタンが作り直され、そこにあったフォーカスが body に落ちる
  return (
    // 付いているタグの名前はアイコンだけでは分からないので、ツールチップで見せる
    <Tooltip label={tag ?? "タグ"} withArrow>
      <button
        type="button"
        className={`${classes.touchTarget} ${classes.tagIconButton}`}
        data-tagged={tag === null ? undefined : ""}
        aria-label={
          // タグの名前を頭に置く (ツールチップに見えている名前を音声入力で言えば押せるように)
          tag === null ? `${subject} のタグを選ぶ` : `${tag} (${subject} のタグを選ぶ)`
        }
        aria-expanded={expanded}
        onMouseDown={keepEditorFocus}
        onClick={onClick}
        ref={ref}
      >
        {tag === null ? <UntaggedIcon /> : <TagIconSvg icon={icon} size={14} />}
      </button>
    </Tooltip>
  );
}

/**
 * 付いているタグの、押せない版 (オフラインの閲覧のみのとき)。アイコンに名前を添える
 * (ツールチップが無く、オフラインではアイコンが分からないこともあるため)
 */
export function SectionTagLabel({ tag, icon }: { tag: string; icon: TagIcon | undefined }) {
  return (
    <span className={classes.tagLabel}>
      <TagIconSvg icon={icon} size={14} />
      <span className={classes.tagName}>{tag}</span>
    </span>
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
    <>
      <Tooltip label={feedback?.message ?? tooltip} opened={feedback ? true : undefined} withArrow>
        <IconButton
          variant="subtle"
          color="gray"
          size="xs"
          // 普段はカードの上の行のラベル (dimmed) と同じ色に揃える。
          // 結果表示中はチェック / × を teal / red で見せる。
          // color は gray のまま、アイコンの色だけ変える (色付きにするとクリック直後のホバー背景が緑/赤に光る)
          className={`${classes.touchTarget} ${
            feedback ? (feedback.ok ? classes.succeeded : classes.failed) : classes.muted
          }`}
          aria-label={label}
          loading={busy}
          onMouseDown={keepEditorFocus}
          onClick={() => void onClick()}
        >
          {feedback ? feedback.ok ? <CheckIcon size={14} /> : <XIcon size={14} /> : children}
        </IconButton>
      </Tooltip>
      {/* Tooltip (role="tooltip") は読み上げられないので、結果はここで通知する */}
      <VisuallyHidden role="status" aria-live="polite">
        {feedback?.message}
      </VisuallyHidden>
    </>
  );
}

function UntaggedIcon() {
  return (
    <Svg size={14}>
      <path d="M7.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3z" />
    </Svg>
  );
}

function CopyIcon() {
  return (
    <Svg size={14}>
      <path d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z" />
      <path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
    </Svg>
  );
}

function CameraIcon() {
  return (
    <Svg size={14}>
      <path d="M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" />
      <path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
    </Svg>
  );
}
