import { Avatar, Button, Group, Loader, Menu, Skeleton, Text, UnstyledButton } from "@mantine/core";
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { clearBoardCache } from "@/lib/board-cache";
import { clearCachedUser, readCachedUser } from "@/lib/session-cache";
import { useOnline } from "@/lib/use-online";

export function UserMenu() {
  const { data, isPending, error, refetch } = authClient.useSession();
  const router = useRouter();
  const online = useOnline();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
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
  const logout = async () => {
    setLogoutError(null);
    setLoggingOut(true);
    try {
      await authClient.signOut();
    } catch {
      // navigator.onLine が true でも実際には届かないことがある (Wi-Fi はあるが接続なし等)
      setLogoutError("オフラインのためログアウトできません");
      setLoggingOut(false);
      return;
    }
    // この端末に残るオフライン閲覧用のキャッシュも消す
    clearCachedUser();
    clearBoardCache(user.id);
    await router.invalidate();
    await router.navigate({ to: "/" });
    setLoggingOut(false);
  };
  return (
    <Group gap="xs" wrap="nowrap">
      <Menu shadow="md" width={200}>
        <Menu.Target>
          {/* button にしてキーボード (Tab → Enter / Space) でも開けるようにする */}
          <UnstyledButton>
            <Group gap="xs" wrap="nowrap">
              {/* 名前は隣に文字で出すので画像の代替テキストは空 (二重に読み上げない) */}
              <Avatar src={user.image} alt="" radius="xl" size="sm" />
              <Text size="sm" truncate maw={160}>
                {user.name}
              </Text>
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{user.email}</Menu.Label>
          {offline && <Menu.Label>オフライン (ログアウトはオンラインで)</Menu.Label>}
          <Menu.Item color="red" disabled={offline || loggingOut} onClick={() => void logout()}>
            ログアウト
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {loggingOut && <Loader size="xs" aria-label="ログアウト中…" />}
      {logoutError && (
        <Text size="xs" c="red" role="alert">
          {logoutError}
        </Text>
      )}
    </Group>
  );
}
