import { createFileRoute } from "@tanstack/react-router";

import { useDocumentTitle } from "@/lib/use-document-title";

import { BoardView } from "./-components/BoardView";
import { loadBoardPage } from "./-lib/data/board-loader";

// 板: ログイン済みの人のメモ。未ログインなら loader がランディング (/) へ転送する (issue #156)
export const Route = createFileRoute("/board/")({
  // Board は loader の結果を初期値にして以後は自身の state で管理するため、
  // 戻ってきたときに古いキャッシュを一瞬でも表示しないよう、離れたら即キャッシュを捨てる
  gcTime: 0,
  // セッション確認も loader で行う (beforeLoad だと、それが済むまでこのルートのチャンクの取得が始まらない。issue #110)
  loader: loadBoardPage,
  component: BoardPage,
});

function BoardPage() {
  const data = Route.useLoaderData();
  // 板のタイトルはトップと同じ (他のページから戻ってきたときに戻す)
  useDocumentTitle();
  return <BoardView data={data} />;
}
