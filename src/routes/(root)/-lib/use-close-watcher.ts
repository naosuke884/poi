import { useEffect, useRef } from "react";

/** CloseWatcher のうち使う部分だけ (TypeScript の DOM 型にまだ無い) */
interface CloseWatcherLike {
  onclose: (() => void) | null;
  destroy(): void;
}
type CloseWatcherConstructor = new () => CloseWatcherLike;

/**
 * 開いている間、Android の戻るボタン / ジェスチャー (と Esc) で onClose を呼ぶ (#122)。
 *
 * 戻る操作をモーダルを閉じるだけにするため。<dialog> が自分で戻る操作を受けるかはブラウザの版によるので、
 * それに任せず、CloseWatcher があるブラウザ (Chromium 系) では開いている間だけ作っておく。
 * 無いブラウザでは何もしない (戻る操作ではルーターが戻るかアプリが終了する)。
 *
 * Esc では <dialog> の close とこちらの両方から呼ばれることがあるので、onClose は何度呼ばれてもよいもの
 * (開閉 state を false にするだけ) にする。Modal (../-components/Modal.tsx) が開いている間これを呼ぶ
 */
export function useCloseWatcher(opened: boolean, onClose: () => void) {
  // onClose が描画ごとに作り直されても、そのたびに作り直さない (作り直すと戻る操作の履歴の扱いが変わる)
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!opened) return;
    const Ctor = (window as { CloseWatcher?: CloseWatcherConstructor }).CloseWatcher;
    if (!Ctor) return;
    let watcher: CloseWatcherLike;
    try {
      watcher = new Ctor();
    } catch {
      // 作れない (文書が非アクティブなど) ときは今までどおり Esc / 外側クリックで閉じる
      return;
    }
    watcher.onclose = () => onCloseRef.current();
    // 閉じた (onclose 後) / 他の手段で閉じた / アンマウントしたときに外す。destroy は close を起こさない
    return () => watcher.destroy();
  }, [opened]);
}
