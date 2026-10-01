import { Anchor, Button, Stack, Text } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import type { GoogleLogin } from "../../-lib/use-google-login";

/**
 * ログインの CTA + 規約への同意文 (同意文は押す場所の近くに添える)。
 * ログインの状態はヘッダーのログインボタンと共有するので、Landing から受け取る
 */
export function LoginCta({ busy, error, login }: GoogleLogin) {
  return (
    <Stack gap="sm" align="center" ta="center">
      <Button size="md" mb="sm" loading={busy} onClick={() => void login()}>
        Google でログインして始める
      </Button>
      {error && (
        <Text size="sm" c="red" role="alert">
          {error}
        </Text>
      )}
      <Text c="dimmed" size="xs">
        ログインすると、
        <Anchor component={Link} to="/terms" size="xs" underline="always">
          利用規約
        </Anchor>
        と
        <Anchor component={Link} to="/privacy" size="xs" underline="always">
          プライバシーポリシー
        </Anchor>
        に同意したものとみなします。
      </Text>
    </Stack>
  );
}
