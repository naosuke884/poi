import { createContext, type ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";

/**
 * ヘッダーの差し込み口。ページ (ルート) が自分用の操作をヘッダーに出すために使う
 * (板の表示切替・追加ボタン・保存状態など)。
 * __root が HeaderSlotProvider で全体を包み、ヘッダーの中の HeaderSlotTarget の位置に、
 * ページが描画した HeaderSlot の中身を portal で出す。
 * ヘッダーはページのことを知らずに済み、ページの状態はページの中 (props) だけで受け渡せる
 */
const TargetContext = createContext<{
  target: HTMLElement | null;
  setTarget: (el: HTMLElement | null) => void;
} | null>(null);

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return <TargetContext value={{ target, setTarget }}>{children}</TargetContext>;
}

/**
 * ヘッダーの中の差し込み位置。display: contents なので、中身はヘッダーの Group の子として並ぶ
 * (間隔は Group の gap がそのまま効き、空のときは場所を取らない)
 */
export function HeaderSlotTarget() {
  const ctx = useContext(TargetContext);
  return <div ref={ctx?.setTarget} data-header-slot="" style={{ display: "contents" }} />;
}

/** 中身をヘッダーの差し込み位置に出す (Provider の外や、差し込み位置がまだ無いときは何も出さない) */
export function HeaderSlot({ children }: { children: ReactNode }) {
  const target = useContext(TargetContext)?.target;
  return target ? createPortal(children, target) : null;
}
