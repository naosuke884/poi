// 画面端から、下部固定 (Affix) の要素を置く位置までの距離。
// 板は幅 60rem (左右の余白 16px 込み) で中央に置かれるので (__root.tsx)、広い画面では固定要素も板の端に
// 揃える (画面の隅だと板から離れすぎる)。狭い画面では従来どおり画面端から 16px (+ ノッチ等の safe-area)。
// 幅は vw ではなく % で取る: 固定要素 (position: fixed) の % はスクロールバーを除いたビューポート基準で、
// 中央寄せの板と同じ幅になる。vw はスクロールバーの幅を含むので、スクロールバーが幅を取る環境
// (Windows / Linux) では板の端から半分 (約 7px) ずれる (issue #131)。
// 16px は板の入れ物自身の左右の余白 (--poi-space-md) と合わせる
export const affixInset = (side: "left" | "right") =>
  `max(calc(16px + env(safe-area-inset-${side})), calc((100% - 60rem) / 2 + 16px))`;
