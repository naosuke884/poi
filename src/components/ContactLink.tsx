import type { ReactNode } from "react";

// 問い合わせ・削除依頼の窓口 (メール)。セルフホストする場合は自分のアドレスに差し替える
export const CONTACT_EMAIL = "884naoki.dev@gmail.com";
export const CONTACT_URL = `mailto:${CONTACT_EMAIL}`;

/** 問い合わせ先 (CONTACT_EMAIL) へのメールリンク。children を省略するとアドレスをそのまま表示する */
export function ContactLink({ children }: { children?: ReactNode }) {
  return <a href={CONTACT_URL}>{children ?? CONTACT_EMAIL}</a>;
}
