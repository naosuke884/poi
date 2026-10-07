/**
 * current を next に変える最小の置換 (前後の共通部分を除いた範囲)。
 * SectionEditor が Board からの value (分割 / 結合 / 取り消し) を doc に反映するのに使う。
 * 全置換だと履歴 (Ctrl+Z) の位置の対応が崩れるので、変わった範囲だけを置き換える。
 * 同じなら null
 */
export function minimalChange(
  current: string,
  next: string,
): { from: number; to: number; insert: string } | null {
  if (current === next) return null;
  let from = 0;
  while (from < current.length && from < next.length && current[from] === next[from]) from++;
  let tail = 0;
  while (
    tail < current.length - from &&
    tail < next.length - from &&
    current[current.length - 1 - tail] === next[next.length - 1 - tail]
  )
    tail++;
  return { from, to: current.length - tail, insert: next.slice(from, next.length - tail) };
}
