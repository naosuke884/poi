import { Avatar, Button, Group, Menu, Skeleton, Text } from "@mantine/core";
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { clearMemoCache } from "@/lib/memo-cache";
import { clearCachedUser, readCachedUser } from "@/lib/session-cache";
import { useOnline } from "@/lib/use-online";

export function UserMenu() {
  const { data, isPending, error, refetch } = authClient.useSession();
  const router = useRouter();
  const online = useOnline();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  // セッション取得が通信エラーで失敗したら (オフライン)、前回ログインしていたユーザーを表示する
  const cachedUser = useMemo(() => (error ? readCachedUser() : null), [error]);

  // オフライン → オンラインに戻った瞬間だけセッションを取り直す (エラーのまま残らないように)。
  // error を deps に入れると、取得に失敗するたびに新しい error オブジェクトになって
  // refetch → 失敗 → refetch … と無限に繰り返すので、復帰のエッジだけで判定し error は ref で読む
  const errorRef = useRef(error);
  errorRef.current = error;
  const wasOffline = useRef(!online);
  useEffect(() => {
    if (online && wasOffline.current && errorRef.current) void refetch();
    wasOffline.current = !online;
  }, [online, refetch]);

  if (isPending) return <Skeleton h={32} w={100} />;

  const user = data?.user ?? cachedUser;
  if (!user) {
    return (
      <Button component={Link} to="/login" size="compact-sm">
        ログイン
      </Button>
    );
  }

  // キャッシュから表示している間、またはオフラインの間はログアウトできない (サーバに届かない)。
  // 通信エラー時もセッションの data は前回の値が残るため、navigator.onLine も見る
  const offline = !data || !online;
  return (
    <Group gap="xs">
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
              setLogoutError(null);
              try {
                await authClient.signOut();
              } catch {
                // navigator.onLine が true でも実際には届かないことがある (Wi-Fi はあるが接続なし等)
                setLogoutError("オフラインのためログアウトできません");
                return;
              }
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
      {logoutError && (
        <Text size="xs" c="red" role="alert">
          {logoutError}
        </Text>
      )}
    </Group>
  );
}
