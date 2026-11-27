import { useCallback, useMemo, useState } from "react";

/** 図 1 つの番。mayPlay が true の間だけ動かし、見え方と動き終わったことを知らせてもらう */
export type FigureTurn = {
  mayPlay: boolean;
  onInViewChange: (inView: boolean) => void;
  onDone: () => void;
};

type FigureState = { inView: boolean; done: boolean };

/**
 * 図を上から順に動かす。見えている図でも、それより上に見えていてまだ動き終わっていない図があれば待つ
 * (大きい画面では 2 つの図が同時に見え、同時に動くと上の図を見ている間に下の図が終わってしまう)。
 * 上の図が見えていない (読み飛ばした・画面の外へ出した) ときは待たない
 */
export function useFigureSequence(count: number): FigureTurn[] {
  const [states, setStates] = useState<FigureState[]>(() =>
    Array.from({ length: count }, () => ({ inView: false, done: false })),
  );
  const update = useCallback((index: number, patch: Partial<FigureState>) => {
    setStates((prev) => prev.map((state, i) => (i === index ? { ...state, ...patch } : state)));
  }, []);
  // 図の effect が毎回やり直されないよう、知らせ先は図ごとに同じ関数にする
  const callbacks = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        onInViewChange: (inView: boolean) => update(index, { inView }),
        onDone: () => update(index, { done: true }),
      })),
    [count, update],
  );
  return states.map((state, index) => ({
    ...callbacks[index],
    mayPlay: state.inView && !states.slice(0, index).some((above) => above.inView && !above.done),
  }));
}
