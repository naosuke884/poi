import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { BottomLeftNotice } from "@/components/BottomLeftNotice";
import { buttonClass } from "@/components/Button";
import { CONTACT_URL } from "@/components/ContactLink";
import { authClient } from "@/lib/auth-client";
import { readCachedUser } from "@/lib/session-cache";

import { useAccountActions } from "../../../-lib/use-account-actions";
import { useOnBackOnline, useOnline } from "../../../-lib/use-online";
import { Avatar } from "./Avatar";
import { DeleteAccountConfirmModal } from "./DeleteAccountConfirmModal";
import { InstallGuideModal, useInstallApp } from "./InstallGuideModal";
import { Menu, MenuAnchor, MenuDivider, MenuItem, MenuLabel, MenuLink } from "./Menu";
import { RunningStatus } from "./RunningStatus";
import { TtlSettingModal } from "./TtlSettingModal";

import skeleton from "./skeleton.module.css";
import classes from "./UserMenu.module.css";

export function UserMenu() {
  const { data, isPending, error, refetch } = authClient.useSession();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const online = useOnline();
  const install = useInstallApp();
  // アカウント操作 (切り替え / 追加 / ログアウト / 削除) と実行中の状態・失敗の文言
  const {
    runningAction,
    actionError,
    clearActionError,
    deviceSessions,
    loadDeviceSessions,
    switchAccount,
    addAccount,
    logout,
    deleteAccount,
  } = useAccountActions();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [settingTtl, setSettingTtl] = useState(false);
  // セッション取得が通信エラーで失敗したら (オフライン)、前回ログインしていたユーザーを表示する
  const cachedUser = useMemo(() => (error ? readCachedUser() : null), [error]);

  // オフライン → オンラインに戻った瞬間だけセッションを取り直す (エラーのまま残らないように)。
  // 取得に失敗するたびに refetch → 失敗 → refetch … と無限に繰り返さないよう、復帰のエッジだけで判定する
  useOnBackOnline(() => {
    if (error) void refetch();
  });

  if (isPending) return <div className={`${skeleton.skeleton} ${classes.skeleton}`} />;

  const user = data?.user ?? cachedUser;
  if (!user) {
    // ログイン専用ページは無いので、ログイン導線 (CTA) のあるランディングへ。
    // ランディング表示中 (=/) は行き先が同じで押しても何も起きないため出さない
    if (pathname === "/") return null;
    return (
      <Link to="/" className={buttonClass({ size: "compact" })}>
        ログイン
      </Link>
    );
  }

  // キャッシュから表示している間、またはオフラインの間はログアウトできない (サーバに届かない)。
  // 通信エラー時もセッションの data は前回の値が残るため、navigator.onLine も見る
  const offline = !data || !online;
  // 今表示しているアカウント以外 (一覧には自分も含まれる)
  const otherSessions = deviceSessions.filter((d) => d.user.id !== user.id);
  const busy = runningAction !== null;
  return (
    <div className={classes.root}>
      {/* 他アカウントの一覧はメニューを開くたびに取り直す (オフラインでは取れないので前のまま) */}
      <Menu
        label={user.name}
        onOpen={() => {
          if (!offline) void loadDeviceSessions();
        }}
        trigger={
          <>
            {/* 狭い画面 (xs 未満) では名前を出す幅が無い (ヘッダーが折り返して 56px からはみ出す) ので
                アイコンだけにする (誰でログインしているかはメニューのメール (オフライン中は名前) で分かる) */}
            <Avatar src={user.image} />
            <span className={classes.name}>{user.name}</span>
          </>
        }
      >
        {/* キャッシュから表示している間はメールアドレスが無い (端末に保存しない。session-cache.ts) ので名前を出す */}
        <MenuLabel>{data?.user.email ?? user.name}</MenuLabel>
        {/* この端末でログイン中の他アカウント (multiSession)。押すとそのまま切り替わる */}
        {otherSessions.map((d) => (
          <MenuItem
            key={d.user.id}
            disabled={offline || busy}
            leftSection={<Avatar src={d.user.image} />}
            onClick={() => void switchAccount(d.session.token)}
          >
            <span className={classes.sessionName}>{d.user.name}</span>
            {/* 同名アカウント (仕事用 / 個人用など) を見分けられるようメールも出す */}
            <span className={classes.sessionEmail}>{d.user.email}</span>
          </MenuItem>
        ))}
        <MenuItem disabled={offline || busy} onClick={() => void addAccount()}>
          アカウントを追加
        </MenuItem>
        <MenuDivider />
        {/* スマホでホーム画面にまだ追加していない人だけに出す (InstallGuideModal を参照) */}
        {install.available && (
          <>
            <MenuItem onClick={install.start}>ホーム画面に追加</MenuItem>
            <MenuDivider />
          </>
        )}
        {/* 保存期間 (セクションの削除までの日数)。サーバへの取得 / 保存があるのでオフラインでは開かせない */}
        <MenuItem disabled={offline} onClick={() => setSettingTtl(true)}>
          保存期間の設定
        </MenuItem>
        <MenuDivider />
        <MenuLink to="/terms">利用規約</MenuLink>
        <MenuLink to="/privacy">プライバシーポリシー</MenuLink>
        <MenuAnchor href={CONTACT_URL}>問い合わせ</MenuAnchor>
        <MenuDivider />
        {offline && <MenuLabel>オフライン (ログアウトはオンラインで)</MenuLabel>}
        <MenuItem danger disabled={offline || busy} onClick={() => void logout()}>
          ログアウト
        </MenuItem>
        <MenuItem danger disabled={offline || busy} onClick={() => setConfirmingDelete(true)}>
          アカウント削除
        </MenuItem>
      </Menu>
      {/* メニューの中だと閉じたときに一緒に消えるので、Modal はメニューの外に置く */}
      <InstallGuideModal {...install.guide} />
      {/* 保存で全セクションの期限が変わるので、板 (loader) を取り直す */}
      <TtlSettingModal
        opened={settingTtl}
        onClose={() => setSettingTtl(false)}
        onSaved={() => void router.invalidate()}
      />
      <DeleteAccountConfirmModal
        opened={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => void deleteAccount(user.id)}
      />
      <RunningStatus action={runningAction} />
      {/* エラーは他の通知と同じく左下に出す (ヘッダー内だと狭くて読みにくい) */}
      {actionError && (
        <BottomLeftNotice
          color="red"
          role="alert"
          closeLabel="エラーを閉じる"
          onClose={clearActionError}
        >
          {actionError}
        </BottomLeftNotice>
      )}
    </div>
  );
}
