// ログアウト / アカウント削除が成功したレスポンスに `Clear-Site-Data: "cookies"` を付け、
// この端末に残る cookie (multiSession で並べている他アカウントのセッションも含む) をブラウザに消させる。
// Set-Cookie での失効 (Better Auth) とクライアント側の後始末 (clearOfflineCaches) に重ねる多重防御で、
// 対応していないブラウザ (Safari など) ではヘッダーが無視されるだけ。
// "storage" / "cache" は Service Worker とプリキャッシュまで消えてオフライン起動できなくなるので付けない
const CLEAR_COOKIES_PATHS = new Set(["/api/auth/sign-out", "/api/auth/delete-user"]);

export function withClearSiteData(request: Request, response: Response): Response {
  if (request.method !== "POST" || !response.ok) return response;
  if (!CLEAR_COOKIES_PATHS.has(new URL(request.url).pathname)) return response;
  // Better Auth の Response のヘッダーは書き換えられないことがあるので、作り直してから付ける
  const cleared = new Response(response.body, response);
  cleared.headers.set("Clear-Site-Data", '"cookies"');
  return cleared;
}
