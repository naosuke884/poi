import { Avatar, Button, Group, Menu, Skeleton, Text, UnstyledButton } from "@mantine/core";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { BottomLeftNotice } from "@/components/BottomLeftNotice";
import { CONTACT_URL } from "@/components/ContactLink";
import { authClient } from "@/lib/auth-client";
import { readCachedUser } from "@/lib/session-cache";

import { useAccountActions } from "../../../-lib/use-account-actions";
import { useOnBackOnline, useOnline } from "../../../-lib/use-online";
import { DeleteAccountConfirmModal } from "./DeleteAccountConfirmModal";
import { InstallGuideModal, useInstallApp } from "./InstallGuideModal";
import { RunningStatus } from "./RunningStatus";
import { TtlSettingModal } from "./TtlSettingModal";

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
  // ポインターで開いたあいだ true。最初の項目 (アカウントを追加) の強調を消す (UserMenu.module.css)。
  // Safari は子要素のあるボタンをタップすると、その後の focus() を :focus-visible とみなす
  // (WebKit 241408)。iPhone ではホーム画面から開いた直後のタップがこれに当たり、
  // 一度テキストを編集すると以降は当たらなくなる。:focus-visible では判定できない (HAY-15)
  const openedByPointer = useRef(false);
  const [pointerOpened, setPointerOpened] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // 開いた直後の focus() は setTimeout なので、この listener より後に起きる。keydown なら
  // その最初のフォーカスには反応せず、矢印などで動かし始めたときだけ強調を戻せる。
  // 項目の Arrow は伝播を止め、Popover は onKeyDownCapture を Escape 処理に差し替えるので、
  // ドロップダウンの keydown では受け取れない
  useEffect(() => {
    if (!menuOpen || !pointerOpened) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[role=menu]")) return;
      if (
        event.key === "Escape" ||
        event.key === "Tab" ||
        event.key === "Shift" ||
        event.key === "Control" ||
        event.key === "Alt" ||
        event.key === "Meta"
      ) {
        return;
      }
      setPointerOpened(false);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [menuOpen, pointerOpened]);
  // セッション取得が通信エラーで失敗したら (オフライン)、前回ログインしていたユーザーを表示する
  const cachedUser = useMemo(() => (error ? readCachedUser() : null), [error]);

  // オフライン → オンラインに戻った瞬間だけセッションを取り直す (エラーのまま残らないように)。
  // 取得に失敗するたびに refetch → 失敗 → refetch … と無限に繰り返さないよう、復帰のエッジだけで判定する
  useOnBackOnline(() => {
    if (error) void refetch();
  });

  if (isPending) return <Skeleton h={32} w={100} />;

  const user = data?.user ?? cachedUser;
  if (!user) {
    // ログイン専用ページは無いので、ログイン導線 (CTA) のあるランディングへ。
    // ランディング表示中 (=/) は行き先が同じで押しても何も起きないため出さない
    if (pathname === "/") return null;
    return (
      <Button component={Link} to="/" size="compact-sm">
        ログイン
      </Button>
    );
  }

  // キャッシュから表示している間、またはオフラインの間はログアウトできない (サーバに届かない)。
  // 通信エラー時もセッションの data は前回の値が残るため、navigator.onLine も見る
  const offline = !data || !online;
  // 今表示しているアカウント以外 (一覧には自分も含まれる)
  const otherSessions = deviceSessions.filter((d) => d.user.id !== user.id);
  const busy = runningAction !== null;
  // 他アカウントの一覧はメニューを開くたびに取り直す (オフラインでは取れないので前のまま)。
  // 強調を消すかは、開く click の前に決めた手段 (ポインターかキーか) をここで見る
  const onOpen = () => {
    setMenuOpen(true);
    setPointerOpened(openedByPointer.current);
    openedByPointer.current = false;
    if (!offline) void loadDeviceSessions();
  };
  return (
    <Group gap="xs" wrap="nowrap">
      {/* withinPortal={false}: メニューをヘッダー (banner ランドマーク) の中に描画する。body 直下の portal だと
          どのランドマークにも属さず、ランドマークで移動する人が辿れない。
          withInitialFocusPlaceholder={false}: 開いたときのフォーカス置き場 (role="presentation" の空の div) を置かず、
          最初の項目にフォーカスする。menu の子に menuitem 以外があると支援技術が構造を取り違える。
          そのフォーカスの見た目は、ポインターで開いたときだけ .flat で消す (キーボードでは矢印ですぐ動ける) */}
      <Menu
        shadow="md"
        width={200}
        onOpen={onOpen}
        onClose={() => setMenuOpen(false)}
        withinPortal={false}
        withInitialFocusPlaceholder={false}
        classNames={{ item: classes.item }}
      >
        <Menu.Target>
          {/* button にしてキーボード (Tab → Enter / Space) でも開けるようにする。
              名前の読み上げは aria-label で (狭い画面では名前の文字を隠すため。下記) */}
          <UnstyledButton
            aria-label={user.name}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              openedByPointer.current = true;
            }}
            onKeyDown={(event) => {
              // Enter / Space は続けて click が来る。ポインターのあとでも、キーで開いた扱いにする
              if (event.key === "Enter" || event.key === " ") openedByPointer.current = false;
            }}
          >
            <Group gap="xs" wrap="nowrap" className={classes.triggerContent}>
              {/* 名前はボタンの aria-label で読み上げるので画像の代替テキストは空 (二重に読み上げない)。
                  狭い画面 (xs 未満) では名前を出す幅が無い (ヘッダーが折り返して 56px からはみ出す) ので
                  アイコンだけにする (誰でログインしているかはメニューのメール (オフライン中は名前) で分かる) */}
              <Avatar src={user.image} alt="" radius="xl" size="sm" />
              <Text size="sm" truncate maw={160} visibleFrom="xs">
                {user.name}
              </Text>
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown className={pointerOpened ? classes.flat : undefined}>
          {/* キャッシュから表示している間はメールアドレスが無い (端末に保存しない。session-cache.ts) ので名前を出す */}
          <Menu.Label>{data?.user.email ?? user.name}</Menu.Label>
          {/* この端末でログイン中の他アカウント (multiSession)。押すとそのまま切り替わる */}
          {otherSessions.map((d) => (
            <Menu.Item
              key={d.user.id}
              disabled={offline || busy}
              leftSection={<Avatar src={d.user.image} alt="" size="sm" radius="xl" />}
              onClick={() => void switchAccount(d.session.token)}
            >
              <Text size="sm" truncate>
                {d.user.name}
              </Text>
              {/* 同名アカウント (仕事用 / 個人用など) を見分けられるようメールも出す */}
              <Text size="xs" c="dimmed" truncate>
                {d.user.email}
              </Text>
            </Menu.Item>
          ))}
          <Menu.Item disabled={offline || busy} onClick={() => void addAccount()}>
            アカウントを追加
          </Menu.Item>
          <Menu.Divider />
          {/* スマホでホーム画面にまだ追加していない人だけに出す (InstallGuideModal を参照) */}
          {install.available && (
            <>
              <Menu.Item onClick={install.start}>ホーム画面に追加</Menu.Item>
              <Menu.Divider />
            </>
          )}
          {/* 保存期間 (セクションの削除までの日数)。サーバへの取得 / 保存があるのでオフラインでは開かせない */}
          <Menu.Item disabled={offline} onClick={() => setSettingTtl(true)}>
            保存期間の設定
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item component={Link} to="/terms">
            利用規約
          </Menu.Item>
          <Menu.Item component={Link} to="/privacy">
            プライバシーポリシー
          </Menu.Item>
          <Menu.Item component="a" href={CONTACT_URL}>
            問い合わせ
          </Menu.Item>
          <Menu.Divider />
          {offline && <Menu.Label>オフライン (ログアウトはオンラインで)</Menu.Label>}
          {/* 文字色は Menu.Item の color (red 6 固定) ではなく、コントラストを確保した red-text にする (app.tsx) */}
          <Menu.Item
            color="red"
            c="var(--mantine-color-red-text)"
            disabled={offline || busy}
            onClick={() => void logout()}
          >
            ログアウト
          </Menu.Item>
          <Menu.Item
            color="red"
            c="var(--mantine-color-red-text)"
            disabled={offline || busy}
            onClick={() => setConfirmingDelete(true)}
          >
            アカウント削除
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {/* Menu.Dropdown の中だと閉じたときに一緒に消えるので、Modal は Menu の外に置く */}
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
    </Group>
  );
}
