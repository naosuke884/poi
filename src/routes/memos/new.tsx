import { createFileRoute } from "@tanstack/react-router";
import { MemoEditor } from "@/components/MemoEditor";
import { requireLogin } from "@/lib/require-login";

// メモ作成画面。最初の入力で POST し、/memos/$id へ replace 遷移する (以降は編集画面と同じ)
export const Route = createFileRoute("/memos/new")({
  beforeLoad: ({ location }) => requireLogin(location),
  component: () => <MemoEditor memo={null} />,
});
