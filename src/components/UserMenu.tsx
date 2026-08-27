import { Avatar, Button, Group, Menu, Skeleton, Text } from "@mantine/core";
import { Link, useRouter } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

export function UserMenu() {
  const { data, isPending } = authClient.useSession();
  const router = useRouter();

  if (isPending) return <Skeleton h={32} w={100} />;

  if (!data) {
    return (
      <Button component={Link} to="/login" size="compact-sm">
        ログイン
      </Button>
    );
  }

  const { user } = data;
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
        <Menu.Item
          color="red"
          onClick={async () => {
            await authClient.signOut();
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
