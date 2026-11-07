import { Link } from "@tanstack/react-router";

import { HeaderSlotTarget } from "@/components/HeaderSlot";

import { UserMenu } from "./user-menu/UserMenu";

import layout from "../RootLayout.module.css";
import classes from "./AppHeader.module.css";

/** 上部固定のヘッダー: 左にロゴ (トップへのリンク)、右にページごとの操作 (HeaderSlot) とユーザーメニュー */
export function AppHeader() {
  return (
    <header className={classes.header}>
      <div className={`${layout.container} ${classes.bar}`}>
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
