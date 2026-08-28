import { Alert } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useOnline } from "@/lib/use-online";

/**
 * navigator.onLine が false の間、ヘッダー下に「オフラインです」バナーを出す。
 * オフライン → オンラインに戻ったら router.invalidate() で表示中ルートの loader を再実行し、
 * キャッシュから表示していた一覧 / メモを最新のデータで置き換える (キャッシュもその時点で上書きされる)。
 * 編集画面の未保存分の再送は MemoEditor 側が online イベントで行う。
 */
export function OfflineBanner() {
  const online = useOnline();
  const router = useRouter();
  const wasOffline = useRef(!online);

  useEffect(() => {
    if (online && wasOffline.current) void router.invalidate();
    wasOffline.current = !online;
  }, [online, router]);

  if (online) return null;

  return (
    <Alert color="yellow" title="オフラインです" role="status" mb="md">
      表示しているのは前回取得した内容です。編集はオンラインに戻ってから保存されます。
    </Alert>
  );
}
