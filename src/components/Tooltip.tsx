import {
  cloneElement,
  useCallback,
  type FocusEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import classes from "./Tooltip.module.css";

// 画面端からこれ以上は寄せない (はみ出す分は内側へずらす)
const VIEWPORT_PADDING = 8;
// 吹き出しと対象の間。矢印がある分だけ (一辺 4px の正方形を 45 度回した半分) 離す
const GAP = 5;
const GAP_WITH_ARROW = GAP + 2;
const ARROW_SIZE = 4;

type TriggerProps = {
  ref?: Ref<HTMLElement>;
  onPointerEnter?: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (e: PointerEvent<HTMLElement>) => void;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
};

type Placement = { top: number; left: number; side: "top" | "bottom"; arrowLeft: number };

/**
 * ボタンなどにマウスを載せたとき (とキーボードでフォーカスしたとき) に出す短い説明。
 * 子は 1 つの要素で、ref とポインタ / フォーカスのイベントを受け取れること (DOM 要素か、それらを渡す部品)。
 * 包む要素を足さないのは、区切り線やヘッダーの並び (flex の gap) に余計な要素が入って位置がずれるため。
 *
 * - 上に出し、上に入らなければ下へ (ヘッダーの中など)。左右は画面からはみ出さないようずらす
 * - body へのポータルに出す: 対象の親の overflow: hidden (表示切替の枠) で切れないように、
 *   また固定のヘッダー (z-index 100) や右下のボタン (200) より上に重なるように
 * - 読み上げの名前にはしない (読み上げ側は aria-label を使い、ツールチップは読まない)。
 *   aria-describedby も付けない: 中身は aria-label の短縮形なので、付けると同じことを 2 回読む
 * - マウス (pointerType が mouse) でだけ出す。タッチではタップで出たものが残って邪魔になる。
 *   フォーカスはキーボード操作 (:focus-visible) のときだけ (クリックしたボタンに出しっぱなしにならないように)
 * - Esc で閉じる (次に載せる / フォーカスするまで出さない)
 * opened を渡すとその間は常に出す (押した結果を見せるとき)。disabled は出さない。
 * offset は対象との間 (既定は矢印ありで 7px、なしで 5px)
 */
export function Tooltip({
  label,
  withArrow = false,
  opened,
  disabled = false,
  offset,
  children,
}: {
  label: ReactNode;
  withArrow?: boolean;
  opened?: boolean;
  disabled?: boolean;
  offset?: number;
  children: ReactElement<TriggerProps>;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const visible = !disabled && (opened ?? ((hovered || focused) && !dismissed));

  useLayoutEffect(() => {
    if (!visible) {
      setPlacement(null);
      return;
    }
    const place = () => {
      const trigger = triggerRef.current;
      const tip = tipRef.current;
      if (!trigger || !tip) return;
      setPlacement(computePlacement(trigger, tip, offset ?? (withArrow ? GAP_WITH_ARROW : GAP)));
    };
    place();
    // 出ている間にスクロール / リサイズしたら付いていく (内側のスクロール領域も拾うため capture で聞く)
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [visible, label, withArrow, offset]);

  useEffect(() => {
    if (!visible || opened !== undefined) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDismissed(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [visible, opened]);

  const child = children;
  const childProps = child.props;
  const childRef = childProps.ref;
  const setTrigger: RefCallback<HTMLElement> = useCallback(
    (el) => {
      triggerRef.current = el;
      return assignRef(childRef, el);
    },
    [childRef],
  );

  const trigger = cloneElement(child, {
    ref: setTrigger,
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      childProps.onPointerEnter?.(e);
      if (e.pointerType !== "mouse") return;
      setDismissed(false);
      setHovered(true);
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      childProps.onPointerLeave?.(e);
      setHovered(false);
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      childProps.onFocus?.(e);
      // 子の中の要素 (表示切替の見えないラジオ) にフォーカスが来たときも出すので、来た要素で見る
      if (!(e.target as Element).matches(":focus-visible")) return;
      setDismissed(false);
      setFocused(true);
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      childProps.onBlur?.(e);
      setFocused(false);
    },
  });

  return (
    <>
      {trigger}
      {visible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            className={classes.tooltip}
            data-side={placement?.side}
            // 位置が決まるまで (最初の 1 回の計測) は見せない
            style={
              placement
                ? { top: placement.top, left: placement.left }
                : { top: 0, left: 0, visibility: "hidden" }
            }
          >
            {label}
            {withArrow && placement && (
              <span className={classes.arrow} style={{ left: placement.arrowLeft }} />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function computePlacement(trigger: HTMLElement, tip: HTMLElement, gap: number): Placement {
  const t = trigger.getBoundingClientRect();
  // offsetWidth は整数に丸めるので、中央に置くと端数の分ずれる
  const { width, height } = tip.getBoundingClientRect();
  const centerX = t.left + t.width / 2;
  const above = t.top - gap - height;
  const side = above < 0 ? "bottom" : "top";
  const top = side === "top" ? above : t.bottom + gap;
  const maxLeft = document.documentElement.clientWidth - VIEWPORT_PADDING - width;
  const left = Math.max(VIEWPORT_PADDING, Math.min(centerX - width / 2, maxLeft));
  // 吹き出しをずらしても矢印は対象の中央を指す (角の丸みにはかからないよう内側にとどめる)
  // (半ピクセル単位に揃えて、回した正方形の縁がにじまないようにする)
  const arrowLeft = Math.max(
    ARROW_SIZE,
    Math.min(Math.round((centerX - left - ARROW_SIZE / 2) * 2) / 2, width - ARROW_SIZE * 2),
  );
  // ページ座標で position: absolute に置く。fixed にしないのは、別の層に描かれて矢印の縁のにじみ方が変わるため
  return { top: top + window.scrollY, left: left + window.scrollX, side, arrowLeft };
}

// 子が持っていた ref にも同じ要素を渡す。React 19 のコールバック ref は片付け関数を返せるので、それも返す
function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") return ref(value);
  if (ref) ref.current = value;
}
