import { useRef, useState } from "react";

// any にしている: 引数の型は handlers ごとに違うので、ここでは問わない
type Handlers = Record<string, (...args: any[]) => unknown>;

/**
 * 描画のたびに作り直される関数のまとまり (handlers) を、同一性の変わらないオブジェクトにして返す。
 * 返すオブジェクトの各関数は、呼ばれた時点で最新の handlers の同じ名前の関数を呼ぶ。
 * memo した子 (SectionRow) に渡しても、親の描画のたびに props が変わって memo が外れないようにするため (issue #114)。
 * - 関数の名前 (キー) は最初の描画のものに固定する (後から足したキーは返すオブジェクトに無い)
 * - 呼ぶのはイベントやエフェクトの中だけにする (描画中に呼ぶと、まだ確定していない描画の関数を呼びうる)
 */
export function useStableHandlers<T extends Handlers>(handlers: T): T {
  const latest = useRef(handlers);
  latest.current = handlers;
  const [stable] = useState(
    () =>
      Object.fromEntries(
        Object.keys(handlers).map((name) => [
          name,
          (...args: unknown[]) => latest.current[name]!(...args),
        ]),
      ) as T,
  );
  return stable;
}
