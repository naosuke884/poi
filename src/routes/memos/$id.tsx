import { Anchor, Stack, Text, Title } from "@mantine/core";
import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { MemoEditor } from "@/components/MemoEditor";
import { api } from "@/lib/api";
import { requireLogin } from "@/lib/require-login";

// メモ編集画面 (自動保存)。期限切れ・存在しない・他人のメモは API が 404 を返すので notFound にする
export const Route = createFileRoute("/memos/$id")({
  beforeLoad: ({ location }) => requireLogin(location),
  // エディタは loader の結果を初期値にして以後は自身の state で管理するため、
  // 一覧から戻ってきたときに古いキャッシュを一瞬でも表示しないよう、離れたら即キャッシュを捨てる
  gcTime: 0,
  loader: async ({ params, location }) => {
    const res = await api.memos[":id"].$get({ param: { id: params.id } });
    if (res.status === 401) {
      // beforeLoad 後にセッションが切れた場合
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    if (res.status === 404) throw notFound();
    if (!res.ok) throw new Error("メモの取得に失敗しました");
    return res.json();
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
  const { memo } = Route.useLoaderData();
  // id が変わったら (別のメモに移動したら) エディタの state を作り直す
  return <MemoEditor key={memo.id} memo={memo} />;
}
