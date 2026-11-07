import { type MouseEvent, type ReactNode, useId, useLayoutEffect, useRef } from "react";

import { useCloseWatcher } from "../-lib/use-close-watcher";

import classes from "./Modal.module.css";

type ModalProps = {
  opened: boolean;
  /** Esc / 背景のクリック / × / 戻る操作で呼ぶ。何度呼ばれてもよいもの (開閉 state を false にするだけ) にする */
  onClose: () => void;
  children: ReactNode;
} & (
  | {
      /** 見出し (ダイアログの名前にもなる)。右に × (閉じる) を出す */
      title: string;
      "aria-label"?: never;
    }
  | {
      /** 見出しを出さないときの名前 (確認ダイアログなど)。× も出さない */
      "aria-label": string;
      title?: never;
    }
);

/**
 * 中央に出すモーダル。<dialog> を showModal() で開くので、フォーカスの閉じ込め・Esc・背後の操作の無効化は
 * ブラウザに任せる。開いたときのフォーカスは [data-autofocus] の要素、無ければブラウザの既定 (最初の操作できる要素)。
 * 閉じるとフォーカスは開いたときの要素 (メニューのボタンなど) に戻る (これもブラウザが行う)。
 *
 * 閉じている間は何も描かない (中身の状態を開くたびに作り直す)
 */
export function Modal(props: ModalProps) {
  // Android の戻る操作でもモーダルだけを閉じる。<dialog> 自体も Chromium では戻る操作で閉じるが、
  // 呼び出し側の onClose を確実に通すため (と閉じる手段を 1 か所に揃えるため) 残す。両方から呼ばれても onClose は冪等
  useCloseWatcher(props.opened, props.onClose);
  if (!props.opened) return null;
  return <OpenModal {...props} />;
}

function OpenModal({ onClose, title, "aria-label": ariaLabel, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  // 閉じたのがこちらの close() (opened が false になったアンマウント) なら、close イベントで onClose を呼び直さない
  const closingByProp = useRef(false);
  // 背景を押し始めた場所。中身で押してから背景まで引きずった (文字の選択など) ときの click では閉じない
  const pressedBackdrop = useRef(false);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // StrictMode の開発時は setup → cleanup → setup と 2 回走るので、前の cleanup の印を消してから開く
    closingByProp.current = false;
    const unlockScroll = lockScroll();
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    // アンマウントの前に閉じる。開いたまま DOM から外すと、開く前の要素にフォーカスが戻らない
    return () => {
      closingByProp.current = true;
      dialog.close();
      unlockScroll();
    };
  }, []);

  const isBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    const dialog = ref.current;
    if (!dialog || event.target !== dialog) return false;
    // 背景 (::backdrop) を押すと target は dialog 自身になる。ダイアログの余白やスクロールバーでも同じなので、位置で分ける
    const r = dialog.getBoundingClientRect();
    return (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    );
  };

  return (
    // 背景のクリックで閉じるのはポインターだけの近道で、キーボードでは Esc (ブラウザが閉じる) と × が同じ役目を持つ
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className={classes.dialog}
      aria-labelledby={title ? titleId : undefined}
      aria-label={ariaLabel}
      aria-describedby={bodyId}
      // Esc などブラウザが閉じたとき。開閉の state をこちらに合わせる
      // close イベントは後から (非同期に) 届くので、もう開き直している (open) ときは前の close の分として無視する
      onClose={(event) => {
        if (closingByProp.current || event.currentTarget.open) return;
        onClose();
      }}
      onPointerDown={(event) => {
        pressedBackdrop.current = isBackdrop(event);
      }}
      onClick={(event) => {
        if (pressedBackdrop.current && isBackdrop(event)) onClose();
        pressedBackdrop.current = false;
      }}
    >
      {title && (
        // header 要素にしない: ページのヘッダーと並ぶ 2 つ目の banner ランドマークとみなされる
        <div className={classes.header}>
          <h2 id={titleId} className={classes.title}>
            {title}
          </h2>
          <button type="button" className={classes.close} aria-label="閉じる" onClick={onClose}>
            <svg viewBox="0 0 15 15" fill="none" aria-hidden="true">
              <path
                d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}
      <div id={bodyId} className={classes.body}>
        {children}
      </div>
    </dialog>
  );
}

/**
 * 開いている間は後ろのページをスクロールさせない。<dialog> は背後を操作できなくするだけで、
 * ホイールやタッチのスクロールは後ろのページに届く。
 * スクロールバーがあったときだけその幅を残す (消すと本文が横にずれる)。CSS の scrollbar-gutter: stable を常に付けないのは、
 * スクロールバーの無い短いページでも幅を空けてしまい、開くたびに本文がずれるため
 */
function lockScroll() {
  const html = document.documentElement;
  const { overflow, scrollbarGutter } = html.style;
  if (window.innerWidth > html.clientWidth) html.style.scrollbarGutter = "stable";
  html.style.overflow = "hidden";
  return () => {
    html.style.overflow = overflow;
    html.style.scrollbarGutter = scrollbarGutter;
  };
}
