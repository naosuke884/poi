import { Alert } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";

import { useOnBackOnline, useOnline } from "../-lib/use-online";

/**
 * navigator.onLine が false の間、ヘッダー下に「オフラインです」バナーを出す。
 * オフライン → オンラインに戻ったら router.invalidate() で表示中ルートの loader を再実行し、
 * キャッシュから表示していた板を最新のデータで置き換える (キャッシュもその時点で上書きされる)。
 * 未保存分の再送は Board 側が online イベントで行う。
 *
 * ライブリージョンは中身と同時に挿入されると読み上げられないことが多いので、role="status" の入れ物は
 * 常にマウントしておき、中の Alert だけを出し入れする (#126)。オフラインは急ぎの知らせではないので
 * 割り込む alert にはしない。Alert の既定の role="alert" は入れ物と二重になるので、名前付きの note にする
 */
export function OfflineBanner() {
  const online = useOnline();
  const router = useRouter();
  useOnBackOnline(() => void router.invalidate());

  return (
    <div role="status">
      {!online && (
        <Alert color="yellow" title="オフラインです" role="note" mb="md">
          表示しているのは前回取得した内容です。編集はオンラインに戻ってから保存されます。
        </Alert>
      )}
    </div>
  );
}
