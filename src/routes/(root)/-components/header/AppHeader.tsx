import { Link, useRouterState } from "@tanstack/react-router";

import { HeaderSlotTarget } from "@/components/HeaderSlot";

import { UserMenu } from "./user-menu/UserMenu";

import layout from "../RootLayout.module.css";
import classes from "./AppHeader.module.css";

/** 上部固定のヘッダー: 左にロゴ (トップへのリンク)、右にページごとの操作 (HeaderSlot) とユーザーメニュー */
export function AppHeader() {
  // 板は本文が列いっぱい (60rem) に広がる。それ以外のページは本文が 720px の列なので、ヘッダーの中身もその幅に揃える
  const wide = useRouterState({ select: (s) => s.location.pathname.startsWith("/board") });
  return (
    <header className={classes.header}>
      <div className={`${layout.container} ${classes.bar} ${wide ? "" : classes.narrow}`}>
        <Link to="/" className={classes.logo}>
          <span className={classes.logoInner}>
            <img src="/icon.svg" alt="" width={24} height={24} className={classes.logoImage} />
            poi
          </span>
        </Link>
        <div className={classes.actions}>
          <HeaderSlotTarget />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
