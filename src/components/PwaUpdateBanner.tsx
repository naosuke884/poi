import { Button } from "@mantine/core";
import { useRegisterSW } from "virtual:pwa-register/react";
import { BottomLeftNotice } from "@/components/BottomLeftNotice";

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
    // 通知は左下に揃える。左下角は板の「削除の取り消し」通知 (Board.tsx) が使うので、その上に出す
    <BottomLeftNotice raised title="更新があります" onClose={() => setNeedRefresh(false)}>
      <Button size="xs" mt="xs" onClick={() => void updateServiceWorker(true)}>
        リロード
      </Button>
    </BottomLeftNotice>
  );
}
