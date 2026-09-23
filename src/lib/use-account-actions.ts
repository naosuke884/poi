import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { authClient, startGoogleLogin } from "@/lib/auth-client";
import { clearOfflineCaches } from "@/lib/require-login";

// listDeviceSessions の戻り (この端末でログイン中のアカウント一覧) のうち使う部分。
// クライアントの推論が any になるので、表示と setActive に必要な形だけ自前で書く
export type DeviceSessions = {
  session: { token: string };
  user: { id: string; name: string; email: string; image?: string | null };
}[];

// 実行中の操作。どれか 1 つしか同時に走らない (busy で他の項目を無効にする) ので 1 つの state で持ち、
// 対応する Loader の読み上げ文言をここから引く
export const RUNNING_LABELS = {
  logout: "ログアウト中…",
  delete: "アカウント削除中…",
  switch: "アカウント切り替え中…",
} as const;
export type RunningAction = keyof typeof RUNNING_LABELS;

/**
 * 操作の試行の結果。null は成功、文字列は失敗 (その文言を出す)、
 * "leaving" は成功してページを離れる (実行中の表示のまま戻さない)
 */
type Attempt = string | null | "leaving";

/**
 * ユーザーメニュー (UserMenu) のアカウント操作: 切り替え / 追加 / ログアウト / 削除と、
 * この端末でログイン中の他アカウントの一覧。実行中の操作 (runningAction) と失敗の文言 (actionError) を持つ
 */
export function useAccountActions() {
  const router = useRouter();
  const [runningAction, setRunningAction] = useState<RunningAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // この端末でログイン中のアカウント (multiSession)。メニューを開くたびに取り直す
  const [deviceSessions, setDeviceSessions] = useState<DeviceSessions>([]);

  /**
   * 操作の共通の流れ: 前のエラーを消して実行中にし、attempt を試す。
   * attempt が投げたら (通信できないなど) failMessage を出す。成功したら after (後始末や画面の更新) を続ける
   */
  const run = async (
    action: RunningAction,
    failMessage: string,
    attempt: () => Promise<Attempt>,
    after?: () => Promise<void>,
  ) => {
    setActionError(null);
    setRunningAction(action);
    let result: Attempt;
    try {
      result = await attempt();
    } catch {
      result = failMessage;
    }
    if (result === "leaving") return;
    if (result === null) await after?.();
    else setActionError(result);
    setRunningAction(null);
  };

  // ログアウト / アカウント削除の後始末: この端末に残るオフライン閲覧用のキャッシュを消し、
  // 板 (loader) を取り直してランディングへ戻る
  const clearCachesAndGoHome = async (cachedUserIds: string[]) => {
    clearOfflineCaches(cachedUserIds);
    await router.invalidate();
    await router.navigate({ to: "/" });
  };

  // メニューを開いたときに他アカウントの一覧を取り直す (切り替え直後・別タブでの追加を拾う)。
  // 失敗したら前の一覧のまま (切り替えの項目が古いか出ないだけ)
  const loadDeviceSessions = async () => {
    try {
      const { data: sessions } = await authClient.multiSession.listDeviceSessions();
      setDeviceSessions(sessions ?? []);
    } catch {
      // オフライン等。既存の表示を消すほどではないので何もしない
    }
  };

  const switchAccount = (sessionToken: string) =>
    run(
      "switch",
      "オフラインのためアカウントを切り替えられません",
      async () => {
        const { error } = await authClient.multiSession.setActive({ sessionToken });
        // 主な失敗は相手側セッションの期限切れ。もう一度ログインしてもらう
        return error
          ? "切り替えられませんでした。もう一度そのアカウントでログインしてください"
          : null;
      },
      // useSession は setActive が再取得を発火する。板 (loader) はここで取り直す
      () => router.invalidate(),
    );

  // もう 1 つの Google アカウントでログインする (今のセッションは cookie に残り、切り替えで戻れる)
  const addAccount = () =>
    run(
      "switch",
      "ログインを開始できませんでした。接続を確認してもう一度お試しください",
      async () => {
        await startGoogleLogin();
        // 成功すると Google へ遷移するので実行中の表示は戻さない
        return "leaving";
      },
    );

  const logout = (userId: string) => {
    // multiSession の signOut はこの端末の全アカウントを一括で外すので、消すべき
    // 板キャッシュのユーザー一覧を先に取っておく (取れなければ今のアカウントの分だけ)
    let cachedUserIds = [userId];
    return run(
      "logout",
      // navigator.onLine が true でも実際には届かないことがある (Wi-Fi はあるが接続なし等)
      "オフラインのためログアウトできません",
      async () => {
        try {
          const { data: sessions } = await authClient.multiSession.listDeviceSessions();
          if (sessions) cachedUserIds = [...new Set([userId, ...sessions.map((d) => d.user.id)])];
        } catch {
          // ここで失敗するなら signOut も失敗する (下でエラー表示になる)
        }
        const { error } = await authClient.signOut();
        // サーバ側で失敗したらセッションは有効なまま。キャッシュも消さずログイン状態のままにする
        return error ? "ログアウトできませんでした。時間をおいてもう一度お試しください" : null;
      },
      () => clearCachesAndGoHome(cachedUserIds),
    );
  };

  // 確認は UserMenu の Modal で済ませてから呼ばれる
  const deleteAccount = (userId: string) =>
    run(
      "delete",
      "オフラインのためアカウントを削除できません",
      async () => {
        const { error } = await authClient.deleteUser();
        // 主な失敗はログインから 1 日以上経ったセッション (Better Auth の鮮度チェック)。
        // 再ログインすれば新しいセッションになり削除できる
        return error
          ? "アカウントを削除できませんでした。一度ログアウトして再ログインし、もう一度お試しください"
          : null;
      },
      () => clearCachesAndGoHome([userId]),
    );

  return {
    runningAction,
    actionError,
    clearActionError: () => setActionError(null),
    deviceSessions,
    loadDeviceSessions,
    switchAccount,
    addAccount,
    logout,
    deleteAccount,
  };
}
