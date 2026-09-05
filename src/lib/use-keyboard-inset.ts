import { useEffect, useState } from "react";

// ソフトキーボードに隠れている画面下端の高さ (px)。キーボードが出ていなければ 0。
// iOS Safari はキーボードが開いても layout viewport を縮めないため、position: fixed で
// 下端に置いた要素はキーボードの裏に残る。下端に固定したい要素は、この分だけ bottom を
// 持ち上げると visual viewport (実際に見えている範囲) の下端に来る
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
