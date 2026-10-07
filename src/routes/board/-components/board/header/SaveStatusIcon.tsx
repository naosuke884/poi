import { ActionIcon, Box, ThemeIcon, Tooltip, VisuallyHidden } from "@mantine/core";
import { type ReactNode, useRef } from "react";
import {
  NO_SAVE_ANNOUNCEMENT,
  nextSaveAnnouncement,
  type SaveState,
} from "../../../-lib/sections/save-status";
import { Svg } from "../TablerIcon";

const OFFLINE_SAVE_MESSAGE = "オフラインです。オンライン復帰後に再保存してください";

/**
 * ヘッダーに出す板の保存状態 (雲のアイコンのみ、説明は Tooltip)。
 * 雲+チェック = 保存済み、雲 = 未保存、雲+↑ = 保存中、雲に斜線 = オフライン、雲+! = 失敗。
 * 閲覧のみ (state が null) のときはアイコンを出さない。offline / error はクリックで再試行。
 * 今の状態の文言は隠しテキストで添える (読み上げの対象にはなるが、変わるたびには読まない)。
 *
 * 変化の読み上げは意味のあるものだけにする (#113、nextSaveAnnouncement)。入力のたびに
 * 「未保存の変更があります」→「保存中…」→「保存済み」と読むと割り込みが続くため。
 * オフライン / エラーは role="alert" で割り込んで伝え、そこから戻って保存できたら role="status" で「保存済み」と読む。
 * どちらのライブリージョンも中身が空のときも残しておく (中身と同時に挿入すると読み上げられないことが多い)
 */
export function SaveStatusIcon({ state }: { state: SaveState | null }) {
  // 前回の描画の読み上げ文言から次を決める (同じ状態で何度描画しても結果は変わらない)
  const announcementRef = useRef(NO_SAVE_ANNOUNCEMENT);
  announcementRef.current = state
    ? nextSaveAnnouncement(announcementRef.current, state.status, problemLabel(state))
    : NO_SAVE_ANNOUNCEMENT;
  const announcement = announcementRef.current;
  return (
    <Box component="span" style={{ display: "inline-flex", alignItems: "center" }}>
      {state && <Inner state={state} />}
      <VisuallyHidden component="span" role="alert">
        {announcement.alert}
      </VisuallyHidden>
      <VisuallyHidden component="span" role="status">
        {announcement.status}
      </VisuallyHidden>
    </Box>
  );
}

/** offline / error の文言 (ツールチップ・隠しテキスト・読み上げで共通)。それ以外は null */
function problemLabel(state: SaveState): string | null {
  switch (state.status) {
    case "offline":
      return OFFLINE_SAVE_MESSAGE;
    case "error":
      return `保存に失敗${state.errorMessage ? `: ${state.errorMessage}` : ""}`;
    default:
      return null;
  }
}

function Inner({ state }: { state: SaveState }) {
  switch (state.status) {
    case "saved":
      return (
        <Status label="保存済み">
          <CloudCheckIcon />
        </Status>
      );
    case "dirty":
      return (
        <Status label="未保存の変更があります">
          <CloudIcon />
        </Status>
      );
    case "saving":
      return (
        <Status label="保存中…" color="ai">
          <CloudUploadIcon />
        </Status>
      );
    case "offline":
      return (
        <RetryStatus label={OFFLINE_SAVE_MESSAGE} color="orange" onRetry={state.retry}>
          <CloudOffIcon />
        </RetryStatus>
      );
    case "error":
      return (
        <RetryStatus label={problemLabel(state) ?? ""} color="red" onRetry={state.retry}>
          <CloudExclamationIcon />
        </RetryStatus>
      );
  }
}

// クリックできない状態 (saved / dirty)
function Status({
  label,
  color = "gray",
  children,
}: {
  label: string;
  color?: string;
  children: ReactNode;
}) {
  return (
    <>
      <Tooltip label={label}>
        <ThemeIcon variant="transparent" color={color} size="sm" aria-hidden="true">
          {children}
        </ThemeIcon>
      </Tooltip>
      <VisuallyHidden>{label}</VisuallyHidden>
    </>
  );
}

// クリックで再試行する状態 (offline / error)。ボタンの役割はそのまま (role を上書きしない)
function RetryStatus({
  label,
  color,
  onRetry,
  children,
}: {
  label: string;
  color: string;
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <VisuallyHidden>{label}</VisuallyHidden>
      <Tooltip label={`${label} (クリックで再試行)`}>
        <ActionIcon
          variant="subtle"
          color={color}
          size="sm"
          aria-label="保存を再試行"
          onClick={onRetry}
        >
          {children}
        </ActionIcon>
      </Tooltip>
    </>
  );
}

function CloudIcon() {
  return (
    <Svg size={18}>
      <path d="M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487h-11.878" />
    </Svg>
  );
}

function CloudCheckIcon() {
  return (
    <Svg size={18}>
      <path d="M11 18.004h-4.343c-2.572 -.004 -4.657 -2.011 -4.657 -4.487c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.38 0 2.573 .813 3.13 1.99" />
      <path d="M15 19l2 2l4 -4" />
    </Svg>
  );
}

function CloudUploadIcon() {
  return (
    <Svg size={18}>
      <path d="M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-1" />
      <path d="M9 15l3 -3l3 3" />
      <path d="M12 12l0 9" />
    </Svg>
  );
}

function CloudOffIcon() {
  return (
    <Svg size={18}>
      <path d="M9.58 5.548c.24 -.11 .492 -.207 .752 -.286c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 .957 -.383 1.824 -1.003 2.454m-2.997 1.033h-11.343c-2.572 -.004 -4.657 -2.011 -4.657 -4.487c0 -2.475 2.085 -4.482 4.657 -4.482c.13 -.582 .37 -1.128 .7 -1.62" />
      <path d="M3 3l18 18" />
    </Svg>
  );
}

function CloudExclamationIcon() {
  return (
    <Svg size={18}>
      <path d="M15 18.004h-8.343c-2.572 -.004 -4.657 -2.011 -4.657 -4.487c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 .957 -.383 1.824 -1.003 2.454" />
      <path d="M19 16v3" />
      <path d="M19 22v.01" />
    </Svg>
  );
}
