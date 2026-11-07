import { Link, type LinkProps } from "@tanstack/react-router";
import {
  createContext,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  use,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import classes from "./Menu.module.css";

/** 画面の端からこれだけ離して出す */
const VIEWPORT_PADDING = 5;

const ITEM_SELECTOR = "[data-menu-item]:not(:disabled)";

type MenuContextValue = {
  /** 項目を選んだあとに閉じ、ボタンにフォーカスを戻す */
  closeAfterSelect: () => void;
};
const MenuContext = createContext<MenuContextValue | null>(null);

/**
 * ボタンと、その下に開く項目の一覧 (role="menu")。操作はメニューボタンの作法 (WAI-ARIA APG) に従う:
 * ↑↓ で項目を移り (端で反対側へ回る。使えない項目は飛ばす)、Home / End で最初 / 最後、
 * Esc で閉じてボタンへ戻る。Tab では閉じて、ボタンから次 (Shift+Tab なら前) の要素へ進む
 * (フォーカスを閉じ込めて Tab では何もしない形にしないのは、APG のメニューボタンは閉じて進むため)。
 * 外側を押しても閉じる。
 *
 * body 直下ではなくボタンの隣に描くので、ヘッダー (banner ランドマーク) の中に入る。
 * 位置は CSS でボタンの下の中央に置き、画面からはみ出す分だけ JS で横にずらす。
 * popover 属性 + アンカー位置指定にしないのは、アンカー位置指定が Safari 26 からで、iPhone の古い Safari で位置が崩れるため
 */
export function Menu({
  label,
  trigger,
  onOpen,
  children,
}: {
  /** ボタンの名前 (読み上げ用。中身の文字は狭い画面で隠すので aria-label にする) */
  label: string;
  /** ボタンの中身 (アイコンや名前) */
  trigger: ReactNode;
  /** 開くたびに呼ぶ */
  onOpen?: () => void;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  // ポインターで開いたあいだ true。最初の項目 (アカウントを追加) の強調を消す (Menu.module.css の .flat)。
  // Safari は子要素のあるボタンをタップすると、その後の focus() を :focus-visible とみなす
  // (WebKit 241408)。iPhone ではホーム画面から開いた直後のタップがこれに当たり、
  // 一度テキストを編集すると以降は当たらなくなる。:focus-visible では判定できない (HAY-15)
  const [pointerOpened, setPointerOpened] = useState(false);
  // 開く click の前に、ポインターかキーかを pointerdown / keydown で覚えておく
  const openedByPointer = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();
  const menuId = useId();

  const open = () => {
    setOpened(true);
    setPointerOpened(openedByPointer.current);
    openedByPointer.current = false;
    onOpen?.();
  };
  const close = ({ returnFocus }: { returnFocus: boolean }) => {
    setOpened(false);
    // 閉じる前に移す: 項目にフォーカスがあるまま消すと、フォーカスが body に落ちる
    if (returnFocus) triggerRef.current?.focus();
  };

  // 開いたら最初の (使える) 項目へフォーカスを移す。描画の直後 (画面に出る前) に移し、
  // 最初の矢印キーの前にフォーカスが項目にあるようにする
  useLayoutEffect(() => {
    if (!opened) return;
    menuRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
  }, [opened]);

  // ボタンの中央の下に置いた一覧が画面からはみ出すなら、その分だけ横にずらす
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!opened || !menu) return;
    const place = () => {
      menu.style.setProperty("--menu-shift", "0px");
      const rect = menu.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const overRight = rect.right - (width - VIEWPORT_PADDING);
      const overLeft = VIEWPORT_PADDING - rect.left;
      const shift = overRight > 0 ? -overRight : overLeft > 0 ? overLeft : 0;
      menu.style.setProperty("--menu-shift", `${shift}px`);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [opened]);

  // 外側を押したら閉じる (フォーカスは押した先に任せる)。ボタンも内側に数える。
  // 外側に数えると、押した pointerdown で閉じ、続く click でまた開いてしまう
  useEffect(() => {
    if (!opened) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpened(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [opened]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const menu = menuRef.current;
    if (!menu) return;
    const items = [...menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR)];
    const current = items.findIndex((item) => item === document.activeElement);
    const focusAt = (index: number) => {
      event.preventDefault();
      items[index]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        focusAt(current === -1 ? 0 : (current + 1) % items.length);
        break;
      case "ArrowUp":
        focusAt(current === -1 ? 0 : (current - 1 + items.length) % items.length);
        break;
      case "Home":
        focusAt(0);
        break;
      case "End":
        focusAt(items.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        close({ returnFocus: true });
        return;
      case "Tab":
        // preventDefault しない: ボタンへ戻したフォーカスから、ブラウザが次 (前) の要素へ進める
        close({ returnFocus: true });
        return;
    }
    // ポインターで開いたあとでも、キーで項目を動かし始めたら強調を戻す (修飾キーだけでは戻さない)
    if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) setPointerOpened(false);
  };

  return (
    <div ref={rootRef} className={classes.root}>
      {/* button にしてキーボード (Tab → Enter / Space) でも開けるようにする */}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={classes.trigger}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={opened}
        aria-controls={opened ? menuId : undefined}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          openedByPointer.current = true;
        }}
        onKeyDown={(event) => {
          // Enter / Space は続けて click が来る。ポインターのあとでも、キーで開いた扱いにする
          if (event.key === "Enter" || event.key === " ") openedByPointer.current = false;
        }}
        onClick={() => (opened ? close({ returnFocus: false }) : open())}
      >
        <span className={classes.triggerContent}>{trigger}</span>
      </button>
      {opened && (
        <MenuContext value={{ closeAfterSelect: () => close({ returnFocus: true }) }}>
          {/* 子は menuitem と見出し・区切りだけにする。menu の子に他の役割の要素があると支援技術が構造を取り違える */}
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-labelledby={triggerId}
            aria-orientation="vertical"
            tabIndex={-1}
            className={[classes.dropdown, pointerOpened && classes.flat].filter(Boolean).join(" ")}
            onKeyDown={onMenuKeyDown}
          >
            {children}
          </div>
        </MenuContext>
      )}
    </div>
  );
}

type ItemOptions = {
  /** 赤い文字にする (ログアウトやアカウント削除) */
  danger?: boolean;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
};

function useItemProps({ danger, onClick }: ItemOptions) {
  const ctx = use(MenuContext);
  return {
    role: "menuitem",
    // 項目は Tab では辿らず、矢印キーで移る
    tabIndex: -1,
    "data-menu-item": "",
    className: [classes.item, danger && classes.danger].filter(Boolean).join(" "),
    // 押してもフォーカスを動かさない (ボタンへ戻すのは閉じるときにまとめて行う)
    onMouseDown: (event: MouseEvent) => event.preventDefault(),
    onClick: (event: MouseEvent<HTMLElement>) => {
      onClick?.(event);
      ctx?.closeAfterSelect();
    },
  } as const;
}

/** 押すと処理を行う項目 */
export function MenuItem({
  disabled,
  leftSection,
  children,
  ...options
}: ItemOptions & { disabled?: boolean; leftSection?: ReactNode; children: ReactNode }) {
  const props = useItemProps(options);
  return (
    <button type="button" disabled={disabled} {...props}>
      {leftSection && <span className={classes.itemSection}>{leftSection}</span>}
      <span className={classes.itemLabel}>{children}</span>
    </button>
  );
}

/** アプリ内のページへの項目 */
export function MenuLink({ to, children }: { to: LinkProps["to"]; children: ReactNode }) {
  const props = useItemProps({});
  return (
    <Link to={to} {...props}>
      <span className={classes.itemLabel}>{children}</span>
    </Link>
  );
}

/** アプリの外 (mailto: など) への項目 */
export function MenuAnchor({ href, children }: { href: string; children: ReactNode }) {
  const props = useItemProps({});
  return (
    <a href={href} {...props}>
      <span className={classes.itemLabel}>{children}</span>
    </a>
  );
}

/** 項目の上に出す小さな見出し (操作できない) */
export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className={classes.label}>{children}</div>;
}

export function MenuDivider() {
  return <div className={classes.divider} />;
}
