import { Alert, Anchor, Stack, Text, Title } from "@mantine/core";
import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { MemoEditor } from "@/components/MemoEditor";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/memo";
import { readCachedMemo, writeCachedMemo } from "@/lib/memo-cache";
import { OfflineError, fetchOrOffline } from "@/lib/offline";
import { requireLogin } from "@/lib/require-login";

// メモ編集画面 (自動保存)。期限切れ・存在しない・他人のメモは API が 404 を返すので notFound にする
export const Route = createFileRoute("/memos/$id")({
  beforeLoad: ({ location }) => requireLogin(location),
  // エディタは loader の結果を初期値にして以後は自身の state で管理するため、
  // 一覧から戻ってきたときに古いキャッシュを一瞬でも表示しないよう、離れたら即キャッシュを捨てる
  gcTime: 0,
  loader: async ({ params, location, context }) => {
    const userId = context.session.user.id;
    let res;
    try {
      res = await fetchOrOffline(() => api.memos[":id"].$get({ param: { id: params.id } }));
    } catch (e) {
      // オフライン: 前回取得した内容があれば閲覧専用で表示する (offline: true)
      if (!(e instanceof OfflineError)) throw e;
      const cached = readCachedMemo(userId, params.id);
      if (!cached) {
        throw new OfflineError("オフラインのため、このメモを取得できません (キャッシュもありません)。");
      }
      return { memo: cached.memo, offline: true, cachedAt: cached.cachedAt };
    }
    if (res.status === 401) {
      // beforeLoad 後にセッションが切れた場合
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    if (res.status === 404) throw notFound();
    if (!res.ok) throw new Error("メモの取得に失敗しました");
    const { memo } = await res.json();
    writeCachedMemo(userId, memo);
    return { memo, offline: false, cachedAt: null };
  },
  notFoundComponent: () => (
    <Stack>
      <Title order={2}>メモが見つかりません</Title>
      <Text c="dimmed">期限切れで消えたか、削除済みか、URL が間違っています。</Text>
      <Anchor component={Link} to="/">
        一覧へ戻る
      </Anchor>
    </Stack>
  ),
  component: EditMemo,
});

function EditMemo() {
  const { memo, offline, cachedAt } = Route.useLoaderData();
  const { session } = Route.useRouteContext();
  return (
    <Stack>
      {offline && (
        <Alert color="yellow" role="status">
          {`オフラインのため閲覧のみです (${cachedAt !== null ? formatDateTime(cachedAt) : "前回取得"} 時点の内容)。`}
          オンラインに戻ると自動的に最新の内容を読み込みます。
        </Alert>
      )}
      {/* id が変わったら (別のメモに移動したら) エディタの state を作り直す。
          キャッシュ表示 (閲覧のみ) → オンライン復帰で最新を取得したときも作り直して最新の内容にする */}
      <MemoEditor
        key={`${memo.id}:${offline ? "offline" : "online"}`}
        memo={memo}
        userId={session.user.id}
        readOnly={offline}
      />
    </Stack>
  );
}
