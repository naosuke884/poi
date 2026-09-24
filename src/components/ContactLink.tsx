import type { ReactNode } from "react";

// 問い合わせ・削除依頼の窓口 (GitHub Issues)。セルフホストする場合は自分のリポジトリに差し替える
export const CONTACT_URL = "https://github.com/naosuke884/poi/issues";

/** 問い合わせ先 (CONTACT_URL) へのリンク。children を省略すると URL をそのまま表示する */
export function ContactLink({ children }: { children?: ReactNode }) {
  return (
    <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
      {children ?? CONTACT_URL}
    </a>
  );
}
