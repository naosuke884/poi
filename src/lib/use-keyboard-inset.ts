import { useEffect, useState } from "react";

/**
 * ソフトキーボードなどで画面 (visual viewport) の外に出ている、ページ (layout viewport) の
 * 上下の帯の高さ (px)。何も出ていなければ 0。
 * iOS Safari も Chrome もキーボードが開いたときに layout viewport は縮めない (visual viewport だけ縮む) ため、
 * position: fixed で下端に置いた要素はキーボードの裏に残る。下端に固定したい要素は bottom を
 * この分だけ持ち上げると、実際に見えている範囲の下端に来る。
 * 「今どこが見えているか」を知りたいところ (SectionEditor のカーソル追従スクロール) でも使う
 */
export function viewportInsets(): { top: number; bottom: number } {
  const vv = window.visualViewport;
  if (!vv) return { top: 0, bottom: 0 };
  const top = Math.max(0, vv.offsetTop);
  return { top, bottom: Math.max(0, window.innerHeight - vv.height - top) };
}

/** キーボードに隠れている画面下端の高さ (px) を追う。下端に固定した要素を持ち上げるのに使う */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(viewportInsets().bottom);
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
