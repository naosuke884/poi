// 画面端から、下部固定 (Affix) の要素を置く位置までの距離。
// 板は Container size="md" (__root.tsx) で幅に上限があるので、広い画面では固定要素も板の端に
// 揃える (画面の隅だと板から離れすぎる)。狭い画面では従来どおり画面端から 16px (+ ノッチ等の safe-area)。
// 30rem は Mantine の --container-size-md (60rem。Container のクラス内でしか参照できない) の半分:
// 板の端 = (100vw - 60rem) / 2 = 50vw - 30rem。除算で書かないのは、Affix が position 値を rem() 変換に
// 通すため、単位のない数字 (「/ 2」の 2) が rem に化けて式が壊れるから。
// 16px は Container 自身の padding-inline (--mantine-spacing-md) と合わせる
export const affixInset = (side: "left" | "right") =>
  `max(calc(16px + env(safe-area-inset-${side})), calc(50vw - 30rem * var(--mantine-scale, 1) + 16px))`;
