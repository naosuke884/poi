import { Alert, Stack } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { Board } from "@/components/Board";
import { formatDateTime } from "@/lib/board";
import { type TopPage, loadTopPage } from "@/lib/board-loader";
import { Landing } from "@/components/Landing";
import { optionalLogin } from "@/lib/require-login";

// メイン画面: ログイン済みなら自分の板、未ログインならランディング (何ができるか + ログイン導線)
export const Route = createFileRoute("/")({
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

function BoardView({
  // userId は context.session からではなく loader の結果から取る: アカウント切り替え (UserMenu の setActive →
  // router.invalidate) では beforeLoad (context) が先に確定し、loader が終わるまで sections は前のアカウントの
  // まま一度描画される。context の userId で key を作るとその瞬間に前の内容のまま作り直してしまい、
  // 新しい板が来ても key が変わらず表示が 1 回前のままになる (issue #52)。
  // loader の userId なら sections と必ず同じアカウントで、板の到着と同時に key が変わる
  data: { sections, ttlDays, offline, cachedAt, userId },
}: {
  data: Extract<TopPage, { kind: "board" }>;
}) {
  // 一度でもオンラインで (最新の内容で) 開いたかどうか。
  // オンラインで開いた後にオフラインになり、復帰時の再取得 (OfflineBanner の router.invalidate) が
  // まだ失敗して loader がキャッシュを返しても、編集中の板を閲覧専用に作り直さない
  // (作り直すとオフラインで入力した未保存分がキャッシュの内容で上書きされて失われる)。
  // 閲覧専用にするのは、最初からキャッシュでしか開けていないときだけ
  const liveRef = useRef(false);
  if (!offline) liveRef.current = true;
  const readOnly = offline && !liveRef.current;
  return (
    <Stack style={{ flex: 1 }}>
      {readOnly && (
        <Alert color="yellow" role="status">
          {`オフラインのため閲覧のみです (${cachedAt !== null ? formatDateTime(cachedAt) : "前回取得"} 時点の内容)。`}
          オンラインに戻ると自動的に最新の内容を読み込みます。
        </Alert>
      )}
      {/* キャッシュ表示 (閲覧のみ) → オンライン復帰で最新を取得したときは作り直して最新の内容にする。
          編集中 (readOnly でない) 間は offline フラグが変わっても作り直さない (未保存分を保持するため)。
          アカウント切り替えでは userId (loader 由来。上記) が変わるので、作り直して切り替え先の板にする (issue #52) */}
      <Board
        key={`${userId}-${readOnly ? "offline" : "online"}`}
        sections={sections}
        userId={userId}
        readOnly={readOnly}
        ttlDays={ttlDays}
      />
    </Stack>
  );
}
