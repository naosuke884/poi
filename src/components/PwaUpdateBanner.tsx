import { useState } from "react";
import { Affix, Button, Notification } from "@mantine/core";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Service Worker を登録し、新バージョンが有効化されたら「更新があります」のバナーを出す。
 *
 * vite.config.ts で registerType: "autoUpdate" にしているので新しい SW は待機せず即座に有効化されるが、
 * 既定の挙動 (その場で window.location.reload()) だと編集中のメモが飛びかねないので、
 * onNeedReload で自動リロードを止めてユーザーにリロードしてもらう。
 * (MemoEditor の beforeunload により、未保存の変更があればリロード時に確認が出る)
 */
export function PwaUpdateBanner() {
  const [needReload, setNeedReload] = useState(false);
  useRegisterSW({
    onNeedReload: () => setNeedReload(true),
    onRegisterError: (error) => console.error("[pwa] service worker registration failed", error),
  });

  if (!needReload) return null;

  return (
    <Affix position={{ bottom: 16, right: 16 }}>
      <Notification
        title="更新があります"
        withBorder
        onClose={() => setNeedReload(false)}
        closeButtonProps={{ "aria-label": "閉じる" }}
      >
        <Button size="xs" mt="xs" onClick={() => window.location.reload()}>
          リロード
        </Button>
      </Notification>
    </Affix>
  );
}
