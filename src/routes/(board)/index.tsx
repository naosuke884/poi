import { createFileRoute } from "@tanstack/react-router";
import { BoardView } from "./-components/BoardView";
import { Landing } from "./-components/landing/Landing";
import { loadTopPage } from "./-lib/data/board-loader";
import { optionalLogin } from "./-lib/data/optional-login";

// メイン画面: ログイン済みなら自分の板、未ログインならランディング (何ができるか + ログイン導線)
export const Route = createFileRoute("/(board)/")({
  beforeLoad: () => optionalLogin(),
  // Board は loader の結果を初期値にして以後は自身の state で管理するため、
  // 戻ってきたときに古いキャッシュを一瞬でも表示しないよう、離れたら即キャッシュを捨てる
  gcTime: 0,
  loader: ({ context }) => loadTopPage(context.session),
  component: BoardPage,
});

function BoardPage() {
  const data = Route.useLoaderData();
  const { session } = Route.useRouteContext();
  if (data.kind === "landing" || session === null) return <Landing />;
  return <BoardView data={data} />;
}
