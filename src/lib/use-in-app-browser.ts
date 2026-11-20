import { isInAppBrowser } from "@shared/in-app-browser";
import { useSyncExternalStore } from "react";

import { isStandalone } from "./install-prompt";

// UA は開いている間に変わらないので購読するものは無い
const subscribeNothing = () => () => {};

/**
 * X などのアプリ内ブラウザで開かれているか。そこでは OAuth の state cookie がコールバックに乗らず、
 * Google のログインが state_mismatch で必ず失敗する。ホーム画面から開いた iOS の PWA も UA に Safari/ が無く
 * WKWebView と同じ形になるが、アプリ内ブラウザではないので除く (PWA で照合付きのログインが通るかは
 * iPhone の実機で確かめる。HAY-42)。
 * ビルド時の描画 (landing.html) では false にし、ブラウザで描き直したときに判定する
 */
export function useInAppBrowser(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => isInAppBrowser(navigator.userAgent) && !isStandalone(),
    () => false,
  );
}
