import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { useDocumentTitle } from "@/lib/use-document-title";
import { loadTopPageWithView } from "./-lib/data/board-loader";

// 板 (CodeMirror・react-markdown を含んで大きい) とランディングは別々のチャンクにする (issue #110)。
// 未ログインでランディングを見るだけなら板のコードを落とさない。どちらを取るかは loader が決めて先に取る
const BoardView = lazyRouteComponent(() => import("./-components/BoardView"), "BoardView");
const Landing = lazyRouteComponent(() => import("./-components/landing/Landing"), "Landing");

// メイン画面: ログイン済みなら自分の板、未ログインならランディング (何ができるか + ログイン導線)
export const Route = createFileRoute("/(board)/")({
  // Board は loader の結果を初期値にして以後は自身の state で管理するため、
  // 戻ってきたときに古いキャッシュを一瞬でも表示しないよう、離れたら即キャッシュを捨てる
  gcTime: 0,
  // セッション確認も loader で行う (beforeLoad だと、それが済むまでこのルートのチャンクの取得が始まらない)。
  // preload は取得済みになると消えるので ?. で呼ぶ
  loader: () =>
    loadTopPageWithView({
      board: () => BoardView.preload?.(),
      landing: () => Landing.preload?.(),
    }),
  component: BoardPage,
});

function BoardPage() {
  const data = Route.useLoaderData();
  // 板もランディングもトップのタイトル (他のページから戻ってきたときに戻す)
  useDocumentTitle();
  if (data.kind === "landing") return <Landing />;
  return <BoardView data={data} />;
}
