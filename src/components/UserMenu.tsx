import {
  Affix,
  Avatar,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  Notification,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { affixInset } from "@/lib/affix";
import { authClient, startGoogleLogin } from "@/lib/auth-client";
import { clearBoardCache } from "@/lib/board-cache";
import { CONTACT_URL } from "@/components/LegalPage";
import { InstallGuideModal, useInstallApp } from "@/components/InstallGuideModal";
import { TtlSettingModal } from "@/components/TtlSettingModal";
import { clearCachedUser, readCachedUser } from "@/lib/session-cache";
import { useOnBackOnline, useOnline } from "@/lib/use-online";

// listDeviceSessions の戻り (この端末でログイン中のアカウント一覧) のうち使う部分。
// クライアントの推論が any になるので、表示と setActive に必要な形だけ自前で書く
type DeviceSessions = {
  session: { token: string };
  user: { id: string; name: string; email: string; image?: string | null };
}[];

// 実行中の操作。どれか 1 つしか同時に走らない (busy で他の項目を無効にする) ので 1 つの state で持ち、
// 対応する Loader の読み上げ文言をここから引く
const RUNNING_LABELS = {
  logout: "ログアウト中…",
  delete: "アカウント削除中…",
  switch: "アカウント切り替え中…",
} as const;
type RunningAction = keyof typeof RUNNING_LABELS;

export function UserMenu() {
  const { data, isPending, error, refetch } = authClient.useSession();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const online = useOnline();
  const install = useInstallApp();
  const [runningAction, setRunningAction] = useState<RunningAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [settingTtl, setSettingTtl] = useState(false);
  // この端末でログイン中の他アカウント (multiSession)。メニューを開くたびに取り直す
  const [deviceSessions, setDeviceSessions] = useState<DeviceSessions>([]);
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
  // メニューを開いたときに他アカウントの一覧を取り直す (切り替え直後・別タブでの追加を拾う)。
  // 失敗したら空のまま (切り替えの項目が出ないだけ)
  const loadDeviceSessions = async () => {
    if (offline) return;
    try {
      const { data: sessions } = await authClient.multiSession.listDeviceSessions();
      setDeviceSessions(sessions ?? []);
    } catch {
      // オフライン等。既存の表示を消すほどではないので何もしない
    }
  };
  // 今表示しているアカウント以外 (一覧には自分も含まれる)
  const otherSessions = deviceSessions.filter((d) => d.user.id !== user.id);
  const switchAccount = async (sessionToken: string) => {
    setActionError(null);
    setRunningAction("switch");
    try {
      const { error: switchApiError } = await authClient.multiSession.setActive({ sessionToken });
      if (switchApiError) {
        // 主な失敗は相手側セッションの期限切れ。もう一度ログインしてもらう
        setActionError("切り替えられませんでした。もう一度そのアカウントでログインしてください");
        setRunningAction(null);
        return;
      }
    } catch {
      setActionError("オフラインのためアカウントを切り替えられません");
      setRunningAction(null);
      return;
    }
    // useSession は setActive が再取得を発火する。板 (loader) はここで取り直す
    await router.invalidate();
    setRunningAction(null);
  };
  // もう 1 つの Google アカウントでログインする (今のセッションは cookie に残り、切り替えで戻れる)
  const addAccount = async () => {
    setActionError(null);
    setRunningAction("switch");
    try {
      await startGoogleLogin();
      // 成功すると Google へ遷移するので runningAction は戻さない
    } catch {
      setActionError("ログインを開始できませんでした。接続を確認してもう一度お試しください");
      setRunningAction(null);
    }
  };
  // ログアウト / アカウント削除の後始末: この端末に残るオフライン閲覧用のキャッシュを消し、
  // 板 (loader) を取り直してランディングへ戻る
  const clearCachesAndGoHome = async (cachedUserIds: string[]) => {
    clearCachedUser();
    for (const id of cachedUserIds) clearBoardCache(id);
    await router.invalidate();
    await router.navigate({ to: "/" });
  };
  const logout = async () => {
    setActionError(null);
    setRunningAction("logout");
    // multiSession の signOut はこの端末の全アカウントを一括で外すので、消すべき
    // 板キャッシュのユーザー一覧を先に取っておく (取れなければ今のアカウントの分だけ)
    let cachedUserIds = [user.id];
    try {
      const { data: sessions } = await authClient.multiSession.listDeviceSessions();
      if (sessions) cachedUserIds = [...new Set([user.id, ...sessions.map((d) => d.user.id)])];
    } catch {
      // ここで失敗するなら signOut も失敗する (下でエラー表示になる)
    }
    try {
      await authClient.signOut();
    } catch {
      // navigator.onLine が true でも実際には届かないことがある (Wi-Fi はあるが接続なし等)
      setActionError("オフラインのためログアウトできません");
      setRunningAction(null);
      return;
    }
    await clearCachesAndGoHome(cachedUserIds);
    setRunningAction(null);
  };
  // 確認は Modal (下記) で済ませてから呼ばれる
  const deleteAccount = async () => {
    setActionError(null);
    setRunningAction("delete");
    try {
      const { error: deleteApiError } = await authClient.deleteUser();
      if (deleteApiError) {
        // 主な失敗はログインから 1 日以上経ったセッション (Better Auth の鮮度チェック)。
        // 再ログインすれば新しいセッションになり削除できる
        setActionError(
          "アカウントを削除できませんでした。一度ログアウトして再ログインし、もう一度お試しください",
        );
        setRunningAction(null);
        return;
      }
    } catch {
      setActionError("オフラインのためアカウントを削除できません");
      setRunningAction(null);
      return;
    }
    await clearCachesAndGoHome([user.id]);
    setRunningAction(null);
  };
  const busy = runningAction !== null;
  return (
    <Group gap="xs" wrap="nowrap">
      <Menu shadow="md" width={200} onOpen={() => void loadDeviceSessions()}>
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
          <Menu.Item color="red" disabled={offline || busy} onClick={() => setConfirmingDelete(true)}>
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
      <Modal opened={confirmingDelete} onClose={() => setConfirmingDelete(false)} withCloseButton={false} centered>
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
                void deleteAccount();
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
        <Affix
          position={{
            bottom: "calc(16px + env(safe-area-inset-bottom))",
            left: affixInset("left"),
          }}
        >
          <Notification
            color="red"
            withBorder
            role="alert"
            onClose={() => setActionError(null)}
            closeButtonProps={{ "aria-label": "閉じる" }}
          >
            {actionError}
          </Notification>
        </Affix>
      )}
    </Group>
  );
}
