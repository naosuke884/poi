import { Anchor, AppShell, Container, Group } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { HeaderSlotTarget } from "@/components/HeaderSlot";
import { UserMenu } from "./user-menu/UserMenu";

// ノッチのある端末 (viewport-fit=cover) を横向きにしたとき、左右の内容が隠れないようにする
const safeAreaX = {
  paddingLeft: "env(safe-area-inset-left)",
  paddingRight: "env(safe-area-inset-right)",
};

/** 上部固定のヘッダー: 左にロゴ (トップへのリンク)、右にページごとの操作 (HeaderSlot) とユーザーメニュー */
export function AppHeader() {
  return (
    <AppShell.Header style={safeAreaX}>
      <Container size="md" h="100%">
        <Group h="100%" justify="space-between">
          <Anchor component={Link} to="/" fw={700} c="inherit" underline="never">
            <Group gap={8} wrap="nowrap">
              <img src="/icon.svg" alt="" width={24} height={24} style={{ display: "block" }} />
              poi
            </Group>
          </Anchor>
          {/* 折り返し禁止: 折り返すと 2 行目が 56px のヘッダーからはみ出して本文に重なる */}
          <Group gap="md" wrap="nowrap">
            <HeaderSlotTarget />
            <UserMenu />
          </Group>
        </Group>
      </Container>
    </AppShell.Header>
  );
}
