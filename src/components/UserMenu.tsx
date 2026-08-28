import { Avatar, Button, Group, Menu, Skeleton, Text } from "@mantine/core";
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { authClient } from "@/lib/auth-client";
import { clearMemoCache } from "@/lib/memo-cache";
import { clearCachedUser, readCachedUser } from "@/lib/session-cache";
import { useOnline } from "@/lib/use-online";

export function UserMenu() {
  const { data, isPending, error, refetch } = authClient.useSession();
  const router = useRouter();
  const online = useOnline();
  // セッション取得が通信エラーで失敗したら (オフライン)、前回ログインしていたユーザーを表示する
  const cachedUser = useMemo(() => (error ? readCachedUser() : null), [error]);

  // オンラインに戻ったらセッションを取り直す (エラーのまま残らないように)
  useEffect(() => {
    if (online && error) void refetch();
  }, [online, error, refetch]);

  if (isPending) return <Skeleton h={32} w={100} />;

  const user = data?.user ?? cachedUser;
  if (!user) {
    return (
      <Button component={Link} to="/login" size="compact-sm">
        ログイン
      </Button>
    );
  }

  // キャッシュから表示している間はログアウトできない (サーバに届かない)
  const offline = !data;
  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <Group gap="xs" style={{ cursor: "pointer" }}>
          <Avatar src={user.image} alt={user.name} radius="xl" size="sm" />
          <Text size="sm">{user.name}</Text>
        </Group>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{user.email}</Menu.Label>
        {offline && <Menu.Label>オフライン (ログアウトはオンラインで)</Menu.Label>}
        <Menu.Item
          color="red"
          disabled={offline}
          onClick={async () => {
            await authClient.signOut();
            // この端末に残るオフライン閲覧用のキャッシュも消す
            clearCachedUser();
            clearMemoCache(user.id);
            await router.invalidate();
            await router.navigate({ to: "/" });
          }}
        >
          ログアウト
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
