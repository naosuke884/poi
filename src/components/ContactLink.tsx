import type { ReactNode } from "react";

// 運営者と問い合わせ先。セルフホストする場合は自分の名前とアドレスに差し替える
export const OPERATOR_NAME = "naosuke884";

export const CONTACT_EMAIL = "884naoki.dev@gmail.com";
export const CONTACT_URL = `mailto:${CONTACT_EMAIL}`;

/** 問い合わせ先 (CONTACT_EMAIL) へのメールリンク。children を省略するとアドレスをそのまま表示する */
export function ContactLink({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <a href={CONTACT_URL} className={className}>
      {children ?? CONTACT_EMAIL}
    </a>
  );
}
