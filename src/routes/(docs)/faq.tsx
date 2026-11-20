import { createFileRoute, redirect } from "@tanstack/react-router";

// 使い方とよくある質問は /docs/guide にまとめた。旧 URL から来た人のために、転送するだけのルートを残している
// (サーバー側は worker/site/pages.ts の PAGE_REDIRECTS が 301 で転送する)
export const Route = createFileRoute("/(docs)/faq")({
  beforeLoad: () => {
    throw redirect({ to: "/docs/guide", hash: "faq", replace: true });
  },
});
