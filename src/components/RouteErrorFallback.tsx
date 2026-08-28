import { Alert, Anchor, Button, Group, Stack } from "@mantine/core";
import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { OfflineError } from "@/lib/offline";

/**
 * ルートの loader / beforeLoad が throw したときの表示 (createRouter の defaultErrorComponent)。
 * オフライン起因 (OfflineError: キャッシュも無くて表示できない) は黄色で区別し、
 * 「再試行」で loader をやり直せるようにする。オンライン復帰時は OfflineBanner が自動で再試行する。
 */
export function RouteErrorFallback({ error }: ErrorComponentProps) {
  const router = useRouter();
  const offline = error instanceof OfflineError;
  return (
    <Stack>
      <Alert color={offline ? "yellow" : "red"} title={offline ? "オフラインです" : "エラーが発生しました"}>
        {error.message}
      </Alert>
      <Group>
        <Button variant="default" onClick={() => void router.invalidate()}>
          再試行
        </Button>
        <Anchor component={Link} to="/">
          一覧へ戻る
        </Anchor>
      </Group>
    </Stack>
  );
}
