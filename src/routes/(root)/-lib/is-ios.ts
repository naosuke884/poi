/**
 * iPhone / iPad / iPod (iOS / iPadOS) か。ホーム画面に追加の手順が iOS だけ違う (共有メニューから) ので見分ける。
 * iPadOS の Safari は既定で Mac と同じ UA を名乗るので、Mac の UA でもタッチ操作ができれば iPad とみなす
 * (Mantine の useOs と同じ判定)。描画のたびに読めば足りるので、useOs のように state に持たない
 */
export function isIos(
  userAgent: string = navigator.userAgent,
  touch: boolean = typeof document !== "undefined" && "ontouchend" in document,
): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh|MacIntel|MacPPC|Mac68K/i.test(userAgent) && touch;
}
