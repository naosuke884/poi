import { Alert, Stack } from "@mantine/core";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useRef } from "react";
import { Board } from "@/components/Board";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/board";
import { readCachedBoard, writeCachedBoard } from "@/lib/board-cache";
import { OfflineError, fetchOrOffline } from "@/lib/offline";
import { requireLogin } from "@/lib/require-login";

// ログイン後のメイン画面: 自分の板 (未ログインなら /login へ)
export const Route = createFileRoute("/")({
  beforeLoad: ({ location }) => requireLogin(location),
  // Board は loader の結果を初期値にして以後は自身の state で管理するため、
  // 戻ってきたときに古いキャッシュを一瞬でも表示しないよう、離れたら即キャッシュを捨てる
  gcTime: 0,
  loader: async ({ location, context }) => {
    const userId = context.session.user.id;
    let res;
    try {
      res = await fetchOrOffline(() => api.board.$get());
    } catch (e) {
      // オフライン: 前回取得した内容があれば閲覧専用で表示する (offline: true)
      if (!(e instanceof OfflineError)) throw e;
      const cached = readCachedBoard(userId);
      if (!cached) {
        throw new OfflineError(
          "オフラインのため、板を取得できません (まだ一度も取得していないためキャッシュもありません)。",
        );
      }
      return { sections: cached.sections, offline: true, cachedAt: cached.cachedAt };
    }
    if (res.status === 401) {
      // beforeLoad 後にセッションが切れた場合
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    if (!res.ok) throw new Error("板の取得に失敗しました");
    const { sections } = await res.json();
    // オフライン閲覧用に最新の内容で上書きする
    writeCachedBoard(userId, sections);
    return { sections, offline: false, cachedAt: null };
  },
  component: BoardPage,
});

function BoardPage() {
  const { sections, offline, cachedAt } = Route.useLoaderData();
  const { session } = Route.useRouteContext();
  // 一度でもオンラインで (最新の内容で) 開いたかどうか。
  // オンラインで開いた後にオフラインになり、復帰時の再取得 (OfflineBanner の router.invalidate) が
  // まだ失敗して loader がキャッシュを返しても、編集中の板を閲覧専用に作り直さない
  // (作り直すとオフラインで入力した未保存分がキャッシュの内容で上書きされて失われる)。
  // 閲覧専用にするのは、最初からキャッシュでしか開けていないときだけ
  const liveRef = useRef(false);
  if (!offline) liveRef.current = true;
  const readOnly = offline && !liveRef.current;
  return (
    <Stack>
      {readOnly && (
        <Alert color="yellow" role="status">
          {`オフラインのため閲覧のみです (${cachedAt !== null ? formatDateTime(cachedAt) : "前回取得"} 時点の内容)。`}
          オンラインに戻ると自動的に最新の内容を読み込みます。
        </Alert>
      )}
      {/* キャッシュ表示 (閲覧のみ) → オンライン復帰で最新を取得したときは作り直して最新の内容にする。
          編集中 (readOnly でない) 間は offline フラグが変わっても作り直さない (未保存分を保持するため) */}
      <Board
        key={readOnly ? "offline" : "online"}
        sections={sections}
        userId={session.user.id}
        readOnly={readOnly}
      />
    </Stack>
  );
}
