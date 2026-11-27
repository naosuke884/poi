import { useEffect, useRef, useState } from "react";

/**
 * 要素が読める位置に見えている間だけ true。図のアニメーションを、見えるまで (と画面の外にある間) 止めておくのに使う。
 * IntersectionObserver が無い環境では false のまま (動く前の最初の絵で止まる)
 */
export function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    // 画面の下の端に少し顔を出しただけでは始めない (下の端で再生し終わって、見たときには止まっている)。
    // 下 15% を除いた範囲に 6 割が入ったら動かす
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.6,
      rootMargin: "0px 0px -15% 0px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, inView };
}
