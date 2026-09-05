import { createFileRoute, redirect } from "@tanstack/react-router";

// ログインページは撤廃した (ランディングの CTA が直接 Google OAuth を開始する)。
// 旧 URL をブックマークしている人のために、/ へ転送するだけのルートを残している
export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
