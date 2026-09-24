// X などアプリに埋め込まれたブラウザ (WebView) かを User-Agent から推定する。
// OAuth の state cookie 照合をこれらのブラウザでだけ省くのに使う (worker/auth/index.ts)。
// 判定を外すと普通のブラウザでは照合が効き、アプリ内ブラウザではログインが state_mismatch で失敗する
const APP_TOKENS = /\b(Twitter|TwitterAndroid|Instagram|FBAN|FBAV|Line)\//;

export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  if (APP_TOKENS.test(userAgent)) return true;
  // Android WebView は "; wv)" を含む
  if (/; wv\)/.test(userAgent)) return true;
  // iOS の WKWebView は Safari / Chrome (CriOS) などと違い "Safari/" トークンを持たない
  return /\b(iPhone|iPad|iPod)\b/.test(userAgent) && !/Safari\//.test(userAgent);
}
