import { Affix, Button, Notification } from "@mantine/core";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Service Worker を登録し、新バージョンが待機状態になったら「更新があります」のバナーを出す。
 *
 * vite.config.ts は registerType: "prompt"。新しい SW はユーザーが「リロード」を押すまで待機し、
 * 旧 SW とその precache は残るので、開いたままのページが遅延読み込みするチャンクが消えることはない。
 * (autoUpdate だと新 SW が即時有効化 + 旧キャッシュ削除され、開きっぱなしの旧ページが壊れうる)
 * 「リロード」で updateServiceWorker(true) → 新 SW が skipWaiting → controllerchange でリロードされる。
 * Board の beforeunload により、未保存の変更があればリロード時に確認が出る。
 */
export function PwaUpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (error) => console.error("[pwa] service worker registration failed", error),
  });

  if (!needRefresh) return null;

  return (
    <Affix position={{ bottom: 16, right: 16 }}>
      <Notification
        title="更新があります"
        withBorder
        onClose={() => setNeedRefresh(false)}
        closeButtonProps={{ "aria-label": "閉じる" }}
      >
        <Button size="xs" mt="xs" onClick={() => void updateServiceWorker(true)}>
          リロード
        </Button>
      </Notification>
    </Affix>
  );
}
