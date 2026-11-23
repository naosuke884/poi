import type { ReactNode } from "react";

/**
 * Tabler Icons (MIT) のアウトラインをそのまま使うための外枠 (依存を増やさないためインライン)。
 * 中身 (path) は使う側が置き、ここで viewBox と線のスタイルを揃える。size は表示サイズ (px)
 */
export function Svg({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
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

// 板のあちこちで使う形 (大きさだけ違う)。1 か所でしか使わない形は、使う側で Svg に path を置く

/** + (セクションの追加・タグの作成) */
export function PlusIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      <path d="M12 5l0 14" />
      <path d="M5 12l14 0" />
    </Svg>
  );
}

/** ✓ (できた・選んでいる) */
export function CheckIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      <path d="M5 12l5 5l10 -10" />
    </Svg>
  );
}

/** × (できなかった・外す) */
export function XIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </Svg>
  );
}
