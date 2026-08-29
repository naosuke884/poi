import { ActionIcon, ThemeIcon, Tooltip } from "@mantine/core";
import type { ReactNode } from "react";
import { useSaveState } from "@/lib/save-status";

export const OFFLINE_SAVE_MESSAGE = "オフラインです。オンライン復帰後に再保存してください";

/**
 * ヘッダーに出す板の保存状態 (雲のアイコンのみ、説明は Tooltip)。
 * 雲+チェック = 保存済み、雲 = 未保存、雲+↑ = 保存中、雲に斜線 = オフライン、雲+! = 失敗。
 * 板を編集していないときは何も描画しない。offline / error はクリックで再試行
 */
export function SaveStatusIcon() {
  const state = useSaveState();
  if (!state) return null;

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
        <Status label="保存中…" color="blue">
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
        <RetryStatus
          label={`保存に失敗${state.errorMessage ? `: ${state.errorMessage}` : ""}`}
          color="red"
          onRetry={state.retry}
        >
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
    <Tooltip label={label}>
      <ThemeIcon variant="transparent" color={color} size="sm" role="status" aria-label={label}>
        {children}
      </ThemeIcon>
    </Tooltip>
  );
}

// クリックで再試行する状態 (offline / error)
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
    <Tooltip label={`${label} (クリックで再試行)`}>
      <ActionIcon
        variant="subtle"
        color={color}
        size="sm"
        role="alert"
        aria-label={`${label}。再試行`}
        onClick={onRetry}
      >
        {children}
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
      width={18}
      height={18}
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

function CloudIcon() {
  return (
    <Svg>
      <path d="M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487h-11.878" />
    </Svg>
  );
}

function CloudCheckIcon() {
  return (
    <Svg>
      <path d="M11 18.004h-4.343c-2.572 -.004 -4.657 -2.011 -4.657 -4.487c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.38 0 2.573 .813 3.13 1.99" />
      <path d="M15 19l2 2l4 -4" />
    </Svg>
  );
}

function CloudUploadIcon() {
  return (
    <Svg>
      <path d="M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-1" />
      <path d="M9 15l3 -3l3 3" />
      <path d="M12 12l0 9" />
    </Svg>
  );
}

function CloudOffIcon() {
  return (
    <Svg>
      <path d="M9.58 5.548c.24 -.11 .492 -.207 .752 -.286c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 .957 -.383 1.824 -1.003 2.454m-2.997 1.033h-11.343c-2.572 -.004 -4.657 -2.011 -4.657 -4.487c0 -2.475 2.085 -4.482 4.657 -4.482c.13 -.582 .37 -1.128 .7 -1.62" />
      <path d="M3 3l18 18" />
    </Svg>
  );
}

function CloudExclamationIcon() {
  return (
    <Svg>
      <path d="M15 18.004h-8.343c-2.572 -.004 -4.657 -2.011 -4.657 -4.487c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 .957 -.383 1.824 -1.003 2.454" />
      <path d="M19 16v3" />
      <path d="M19 22v.01" />
    </Svg>
  );
}
