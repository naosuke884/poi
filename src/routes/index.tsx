import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  EmptyState,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { MEMO_TTL_DAYS } from "../../worker/memo/constants";
import { api } from "@/lib/api";
import {
  MEMO_EXPIRY_WARNING_DAYS,
  formatDateTime,
  memoDisplayTitle,
  remainingDays,
  type MemoListItem,
} from "@/lib/memo";
import { requireLogin } from "@/lib/require-login";

// ログイン後のメイン画面: 自分のメモ一覧 (未ログインなら /login へ)
export const Route = createFileRoute("/")({
  beforeLoad: ({ location }) => requireLogin(location),
  loader: async ({ location }) => {
    const res = await api.memos.$get();
    if (res.status === 401) {
      // beforeLoad 後にセッションが切れた場合
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    if (!res.ok) throw new Error("メモ一覧の取得に失敗しました");
    return res.json();
  },
  component: MemoList,
});

function MemoList() {
  const { memos } = Route.useLoaderData();
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<MemoListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await api.memos[":id"].$delete({ param: { id: deleteTarget.id } });
      // 404 は既に削除済み (or 期限切れ) なので一覧を再取得するだけでよい
      if (!res.ok && res.status !== 404) {
        throw new Error("メモの削除に失敗しました");
      }
      setDeleteTarget(null);
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "メモの削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2}>メモ</Title>
        <Button component={Link} to="/memos/new">
          新規作成
        </Button>
      </Group>

      {error && (
        <Alert color="red" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {memos.length === 0 ? (
        <EmptyState
          title="メモはまだありません"
          description={`メモは作成から ${MEMO_TTL_DAYS} 日で自動的に消えます。「新規作成」から最初のメモを書いてみましょう。`}
          py="xl"
        >
          <EmptyState.Actions>
            <Button component={Link} to="/memos/new">
              新規作成
            </Button>
          </EmptyState.Actions>
        </EmptyState>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {memos.map((memo) => (
            <MemoCard key={memo.id} memo={memo} onDelete={() => setDeleteTarget(memo)} />
          ))}
        </SimpleGrid>
      )}

      <Modal
        opened={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="メモを削除"
        centered
      >
        <Stack>
          <Text size="sm">
            「{deleteTarget ? memoDisplayTitle(deleteTarget) : ""}」を削除します。
            この操作は取り消せません。
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              キャンセル
            </Button>
            <Button color="red" onClick={handleDelete} loading={deleting}>
              削除
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function MemoCard({ memo, onDelete }: { memo: MemoListItem; onDelete: () => void }) {
  const days = remainingDays(memo.expiresAt);
  const warning = days <= MEMO_EXPIRY_WARNING_DAYS;
  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="xs" h="100%">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Anchor
            // component={Link} だと params の型が付かないので renderRoot で Link を渡す
            renderRoot={(props) => <Link to="/memos/$id" params={{ id: memo.id }} {...props} />}
            fw={600}
            c="inherit"
            lineClamp={2}
            style={{ wordBreak: "break-word" }}
            miw={0}
          >
            {memoDisplayTitle(memo)}
          </Anchor>
          <Badge
            color={warning ? "orange" : "gray"}
            variant={warning ? "filled" : "light"}
            style={{ flexShrink: 0 }}
          >
            残り {days} 日
          </Badge>
        </Group>
        <Group justify="space-between" align="center" mt="auto">
          <Text size="xs" c="dimmed">
            更新: {formatDateTime(memo.updatedAt)}
          </Text>
          <Button variant="subtle" color="red" size="compact-xs" onClick={onDelete}>
            削除
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
