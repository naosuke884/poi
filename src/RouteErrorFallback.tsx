import { type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { OfflineError } from "@/lib/offline";
import { useDocumentTitle } from "@/lib/use-document-title";

import classes from "./RouteErrorFallback.module.css";
import typography from "@/components/typography.module.css";

/**
 * ルートの loader / beforeLoad が throw したときの表示 (createRouter の defaultErrorComponent)。
 * オフライン起因 (OfflineError: キャッシュも無くて表示できない) は黄色で区別し、
 * 「再試行」で loader をやり直せるようにする。オンライン復帰時は OfflineBanner が自動で再試行する。
 */
export function RouteErrorFallback({ error }: ErrorComponentProps) {
  const router = useRouter();
  const offline = error instanceof OfflineError;
  const title = offline ? "オフラインです" : "エラーが発生しました";
  // 見出し (h1) は無いので、遷移後のフォーカスは #main に移る
  useDocumentTitle(title);
  return (
    <div className={classes.root}>
      <Alert tone={offline ? "attention" : "danger"} title={title}>
        {error instanceof Error ? error.message : String(error)}
      </Alert>
      <div className={classes.actions}>
        <Button variant="default" onClick={() => void router.invalidate()}>
          再試行
        </Button>
        <Link to="/" className={typography.link}>
          トップへ戻る
        </Link>
      </div>
    </div>
  );
}
