import {
  Avatar,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BottomLeftNotice } from "@/components/BottomLeftNotice";
import { InstallGuideModal, useInstallApp } from "@/components/InstallGuideModal";
import { CONTACT_URL } from "@/components/LegalPage";
import { TtlSettingModal } from "@/components/TtlSettingModal";
import { authClient } from "@/lib/auth-client";
import { readCachedUser } from "@/lib/session-cache";
import { RUNNING_LABELS, useAccountActions } from "@/lib/use-account-actions";
import { useOnBackOnline, useOnline } from "@/lib/use-online";

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
  // 他アカウントの一覧はメニューを開くたびに取り直す (オフラインでは取れないので前のまま)
  const onOpen = () => {
    if (!offline) void loadDeviceSessions();
  };
  return (
    <Group gap="xs" wrap="nowrap">
      <Menu shadow="md" width={200} onOpen={onOpen}>
        <Menu.Target>
          {/* button にしてキーボード (Tab → Enter / Space) でも開けるようにする。
              名前の読み上げは aria-label で (狭い画面では名前の文字を隠すため。下記) */}
          <UnstyledButton aria-label={user.name}>
            <Group gap="xs" wrap="nowrap">
              {/* 名前はボタンの aria-label で読み上げるので画像の代替テキストは空 (二重に読み上げない)。
                  狭い画面 (xs 未満) では名前を出す幅が無い (ヘッダーが折り返して 56px からはみ出す) ので
                  アイコンだけにする (誰でログインしているかはメニューのメールで分かる) */}
              <Avatar src={user.image} alt="" radius="xl" size="sm" />
              <Text size="sm" truncate maw={160} visibleFrom="xs">
                {user.name}
              </Text>
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{user.email}</Menu.Label>
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
          <Menu.Item component="a" href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
            問い合わせ
          </Menu.Item>
          <Menu.Divider />
          {offline && <Menu.Label>オフライン (ログアウトはオンラインで)</Menu.Label>}
          <Menu.Item color="red" disabled={offline || busy} onClick={() => void logout()}>
            ログアウト
          </Menu.Item>
          <Menu.Item
            color="red"
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
      {/* 見出しは付けない (本文だけで足りる)。閉じるのはキャンセル / Esc / 外側クリック */}
      <Modal
        opened={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        withCloseButton={false}
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            アカウントを削除しますか？
            <br />
            メモした内容はすべて消え、元に戻せません。
          </Text>
          {/* 取り返しがつかない操作なので、キャンセルを主ボタン (塗り + 初期フォーカス) にして強調する */}
          <Group gap="sm">
            <Button
              color="red"
              variant="outline"
              onClick={() => {
                setConfirmingDelete(false);
                void deleteAccount(user.id);
              }}
            >
              削除する
            </Button>
            <Button data-autofocus onClick={() => setConfirmingDelete(false)}>
              キャンセル
            </Button>
          </Group>
        </Stack>
      </Modal>
      {runningAction && <Loader size="xs" aria-label={RUNNING_LABELS[runningAction]} />}
      {/* エラーは他の通知と同じく左下に出す (ヘッダー内だと狭くて読みにくい) */}
      {actionError && (
        <BottomLeftNotice color="red" role="alert" onClose={clearActionError}>
          {actionError}
        </BottomLeftNotice>
      )}
    </Group>
  );
}
