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
