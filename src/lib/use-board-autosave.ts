import { useBlocker, useRouter } from "@tanstack/react-router";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  applyTtlDays,
  type BoardSection,
  type DraftSection,
  type EditableSection,
  overLimitMessage,
  pruneExpired,
  sameDraft,
  toDraft,
  toPutPayload,
  toSaved,
} from "@/lib/board";
import { writeCachedBoard } from "@/lib/board-cache";
import { mergeBoard } from "@/lib/board-merge";
import { fetchOrOffline, isOffline, OfflineError } from "@/lib/offline";
import { publishSaveState, type SaveStatus } from "@/lib/save-status";
import { readCachedUser } from "@/lib/session-cache";

// 入力停止からこの時間だけ待ってから保存する
const AUTOSAVE_DELAY_MS = 1000;

/** サーバにある板 (取得 / 保存の結果) とその版 */
type RemoteBoard = { sections: BoardSection[]; revision: string | null };

// ログアウト / セッション切れ (キャッシュ済みユーザーが消える) や切り替えの後に完了した取得 / 保存では、
// 消したキャッシュを作り直さない
function cacheBoard(userId: string, sections: BoardSection[], asOf?: number) {
  if (readCachedUser()?.id === userId) writeCachedBoard(userId, sections, asOf);
}

/**
 * 板を保存し (PUT /api/board)、成功したらオフライン閲覧用のキャッシュも更新して、保存後のセクションと版を返す。
 * 通常の自動保存とアンマウント時の保存の両方がこれを通る (どちらの経路でもキャッシュが古いまま残らないように)。
 * 上限の確認は呼び出し側で済ませておく。
 * - ログイン中のアカウントが userId と違えば (別タブ / 別の操作で切り替わった) 保存されず、UserMismatchError
 * - revision より後に別の場所で保存されていれば保存されず、StaleError (取り込んでから保存し直す)
 */
async function putBoard(
  userId: string,
  revision: string | null,
  draft: DraftSection[],
): Promise<RemoteBoard> {
  const res = await api.board.$put({ json: toPutPayload(userId, revision, draft) });
  if (res.status === 409) {
    const body = (await res.json()) as { error?: string };
    if (body.error === "UserMismatch") throw new UserMismatchError();
    if (body.error === "Stale") throw new StaleError();
  }
  if (!res.ok) throw new Error(`保存に失敗しました (${res.status})`);
  const saved = await res.json();
  cacheBoard(userId, saved.sections);
  return saved;
}

/** 板を取り直す (GET /api/board)。ログイン中のアカウントが userId と違えば UserMismatchError */
async function getBoard(userId: string): Promise<RemoteBoard> {
  const requestedAt = Date.now();
  const res = await api.board.$get();
  if (!res.ok) throw new Error(`板の取得に失敗しました (${res.status})`);
  const board = await res.json();
  if (board.userId !== userId) throw new UserMismatchError();
  cacheBoard(userId, board.sections, requestedAt);
  return board;
}

/** 保存しようとした板の持ち主と、ログイン中のアカウントが違う */
class UserMismatchError extends Error {
  constructor() {
    super("別のアカウントに切り替わったため、保存しませんでした");
    this.name = "UserMismatchError";
  }
}

/** 保存の前提にした版より後に、別の端末 / タブで板が保存されていた */
class StaleError extends Error {
  constructor() {
    super("別の場所で板が更新されていました");
    this.name = "StaleError";
  }
}

/**
 * 板の自動保存と保存状態。編集操作はすべて update() を通す (状態を更新し、自動保存を予約する)。
 * - 入力停止から 1 秒後に丸ごと保存し、保存状態はヘッダーのアイコン (SaveStatusIcon) に出す
 * - アンマウント時は debounce 待ちの編集をその場で保存し、未保存の間はタブを閉じる /
 *   リロード / SPA 内の遷移 (オフライン時) の前に確認を出す
 * - オフラインの間は送らずに待ち、online イベントで再送する
 * - 別の端末 / タブで保存された板を上書きしない (issue #72): 保存には前提にした版を付け、断られたら
 *   取り直して手元の変更を重ね (mergeBoard)、保存し直す。タブに戻ってきたときも取り直して重ねる
 *   (開いたままの古い板が残り続けないように)
 * latestRef / commit は useBoardSections が持つ画面上のセクション (state は描画用、処理は ref を読む)。
 * commit は状態の差し替えだけで、保存後にサーバの id / 期限を戻すのにも使う。
 * ttlDays はそのユーザーの保持日数 (変わったら画面上のセクションの期限を引き直す)
 */
export function useBoardAutosave({
  initial,
  initialRevision,
  userId,
  readOnly,
  ttlDays,
  latestRef,
  commit,
}: {
  initial: BoardSection[];
  initialRevision: string | null;
  userId: string;
  readOnly: boolean;
  ttlDays: number;
  latestRef: RefObject<EditableSection[]>;
  commit: (next: EditableSection[]) => void;
}) {
  const router = useRouter();
  // サーバに保存済みのもの (差分の有無の判定と、取り直した板に手元の変更を重ねるときの基準) とその版
  const savedRef = useRef<DraftSection[]>(toSaved(initial));
  const revisionRef = useRef(initialRevision);

  const [status, setStatus] = useState<SaveStatus>("saved");
  const statusRef = useRef(status);
  statusRef.current = status;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 保存中 / 取り直し中 (どちらも savedRef と画面を書き換えるので、同時には走らせない)
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // 期限を過ぎたセクションを画面から外す (pruneExpired。送り返すと新しい期限で作り直されるため: issue #74)。
  // サーバでももう見えない行なので、保存済みの控えからも除く
  const dropExpired = useCallback(() => {
    const pruned = pruneExpired(latestRef.current, savedRef.current, Date.now());
    if (!pruned) return;
    savedRef.current = savedRef.current.filter((s) => !pruned.expiredIds.has(s.id ?? ""));
    commit(pruned.next);
  }, [commit]);

  /** 画面の内容が保存済みのものと違うか */
  const hasChanges = () => !sameDraft(toDraft(latestRef.current), savedRef.current);

  // 板を取り直し、版が変わっていれば画面に取り込む (手元の変更は残す。mergeBoard)。
  // 取り込んだ後に手元の変更が残っていれば、呼び出し側が続けて保存する
  const pull = useCallback(async () => {
    const remote = await fetchOrOffline(() => getBoard(userId));
    if (remote.revision === revisionRef.current) return;
    commit(mergeBoard(latestRef.current, savedRef.current, remote.sections));
    savedRef.current = toSaved(remote.sections);
    revisionRef.current = remote.revision;
  }, [userId]);

  // 別のアカウントに切り替わっていた: 保存しない。読み込み直して切り替え先の板にする
  // (loader の userId が変わるので Board ごと作り直される)
  const onUserMismatch = useCallback(
    (e: UserMismatchError) => {
      setStatus("error");
      setErrorMessage(e.message);
      void router.invalidate();
    },
    [router],
  );

  const save = useCallback(async () => {
    cancelTimer();
    // 保存中なら何もしない (完了時に最新の内容と比べて、差分があれば続けて保存する)
    if (inFlightRef.current) return;

    dropExpired();
    const draft = toDraft(latestRef.current);
    if (sameDraft(draft, savedRef.current)) {
      setStatus("saved");
      return;
    }
    const limit = overLimitMessage(draft);
    if (limit !== null) {
      setStatus("error");
      setErrorMessage(limit);
      return;
    }
    // 確実にオフラインなら送らずに待つ (online イベントで再試行する)
    if (isOffline()) {
      setStatus("offline");
      return;
    }

    inFlightRef.current = true;
    setStatus("saving");
    setErrorMessage(null);

    let synced = false;
    try {
      try {
        const updated = await fetchOrOffline(() => putBoard(userId, revisionRef.current, draft));
        savedRef.current = toSaved(updated.sections);
        revisionRef.current = updated.revision;
        // レスポンスは送った順に並ぶ (サーバが送られた順に対応付けて返す) ので、送ったセクションにサーバの id と期限を戻す。
        // 送っていない (空だった) セクションはサーバから消えているので id を外す。
        // 保存中の入力 (content) はそのまま残す (差分があれば続けて保存される)
        const byKey = new Map(draft.map((d, i) => [d.key, updated.sections[i]]));
        commit(
          latestRef.current.map((s) => {
            const u = byKey.get(s.key);
            if (u) return { ...s, id: u.id, createdAt: u.createdAt, expiresAt: u.expiresAt };
            return s.id === null ? s : { ...s, id: null, createdAt: null, expiresAt: null };
          }),
        );
      } catch (e) {
        if (!(e instanceof StaleError)) throw e;
        // 別の場所で保存されていた (何も書かれていない)。取り直して手元の変更を重ね、下で保存し直す
        await pull();
      }
      synced = true;
      // 保存中に入力があれば (取り直したときは手元の変更があれば)、まだ保存済みではない
      // (下で続けて保存する。その間もタブを閉じる前に確認を出す)
      setStatus(hasChanges() ? "dirty" : "saved");
    } catch (e) {
      if (e instanceof UserMismatchError) {
        onUserMismatch(e);
      } else if (e instanceof OfflineError) {
        // 入力内容はそのまま保持し、オンライン復帰時に再送する
        setStatus("offline");
      } else {
        setStatus("error");
        setErrorMessage(e instanceof Error ? e.message : "保存に失敗しました");
      }
    } finally {
      inFlightRef.current = false;
    }

    // 保存中にさらに入力があれば (取り直したときは手元の変更が残っていれば)、debounce を挟んで続けて保存する
    // (失敗時は「再試行」に任せる)。即座に保存すると入力が続く限り PUT が連発するので、通常の自動保存と同じ待ち時間を置く
    if (synced && hasChanges()) {
      cancelTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void save();
      }, AUTOSAVE_DELAY_MS);
    }
  }, [userId, pull, onUserMismatch, dropExpired]);

  const scheduleSave = useCallback(() => {
    cancelTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void save();
    }, AUTOSAVE_DELAY_MS);
  }, [save]);

  // 編集操作はすべてここを通す (状態を更新し、自動保存を予約する)
  const update = (next: EditableSection[]) => {
    commit(next);
    if (sameDraft(toDraft(next), savedRef.current)) {
      cancelTimer();
      // 保存中なら、完了後に保存済みになるのは送った別の内容なので「保存中…」のまま
      // (完了時に今の内容との差分を見て、続けて保存される)
      if (!inFlightRef.current) setStatus("saved");
      return;
    }
    // 保存中は「保存中…」のまま (完了後に続けて保存されるので、その時点で状態が更新される)
    if (!inFlightRef.current) setStatus("dirty");
    scheduleSave();
  };

  // タブに戻ってきたら (別のアプリ / タブ / ウィンドウから) 板を取り直し、別の場所で保存された内容を取り込む。
  // 保存中なら何もしない (その保存が古ければ断られて取り直す)。取り直せなければ次の保存に任せる
  // (古い版のままなら断られて取り直す)
  const refresh = useCallback(async () => {
    if (inFlightRef.current || isOffline()) return;
    inFlightRef.current = true;
    let pulled = false;
    try {
      await pull();
      pulled = true;
    } catch (e) {
      if (e instanceof UserMismatchError) onUserMismatch(e);
    } finally {
      inFlightRef.current = false;
    }
    if (!pulled) return;
    // 取り直している間の入力や、取り込んでも残った手元の変更を保存する
    if (hasChanges()) {
      if (statusRef.current === "saved") setStatus("dirty");
      scheduleSave();
    } else {
      cancelTimer();
      setStatus("saved");
    }
  }, [pull, onUserMismatch, scheduleSave]);

  useEffect(() => {
    if (readOnly) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onFocus = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [readOnly, refresh]);

  // アンマウント時: タイマーを片付け、debounce 待ちの編集があればその場で保存する。
  // 保存中なら完了時のフォローアップ保存 (save 内のタイマー) に任せる。
  // オフラインなら送っても届かない (離脱前に useBlocker で確認済み) ので何もしない
  useEffect(() => {
    return () => {
      cancelTimer();
      const pruned = pruneExpired(latestRef.current, savedRef.current, Date.now());
      const saved = pruned
        ? savedRef.current.filter((s) => !pruned.expiredIds.has(s.id ?? ""))
        : savedRef.current;
      const draft = toDraft(pruned?.next ?? latestRef.current);
      if (!inFlightRef.current && !isOffline() && !sameDraft(draft, saved)) {
        if (overLimitMessage(draft) !== null) return;
        const base = savedRef.current;
        void putBoard(userId, revisionRef.current, draft)
          .catch(async (e) => {
            if (!(e instanceof StaleError)) throw e;
            // 別の場所で保存されていた: 取り直して手元の変更を重ね、1 回だけ保存し直す
            const remote = await getBoard(userId);
            const merged = toDraft(mergeBoard(latestRef.current, base, remote.sections));
            if (overLimitMessage(merged) !== null) return;
            await putBoard(userId, remote.revision, merged);
          })
          .catch(() => {
            // 離脱後なので UI には出せない。ネットワーク断ならその編集は失われる (スコープ外)
          });
      }
    };
    // マウント時に一度だけ実行する (readOnly はマウント後に変わらない: 変わるときは key で作り直される)
  }, []);

  // 保持日数が変わったら (設定の変更 → 板の読み込み直し)、画面上のセクションの期限も引き直し、過ぎたものを外す。
  // 読み込み直しても Board は作り直さない (未保存の入力を保つため) ので、ここでサーバに合わせる
  const ttlDaysRef = useRef(ttlDays);
  useEffect(() => {
    if (ttlDays === ttlDaysRef.current) return;
    ttlDaysRef.current = ttlDays;
    commit(applyTtlDays(latestRef.current, ttlDays, Date.now()));
    dropExpired();
  }, [ttlDays, commit, dropExpired]);

  // オンラインに復帰したら、オフラインで保存できなかった分 (や失敗したまま残っている分) を再送する
  useEffect(() => {
    if (readOnly) return;
    const onOnline = () => {
      const s = statusRef.current;
      if (s === "offline" || s === "error" || s === "dirty") void save();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [readOnly, save]);

  // 保存状態をヘッダーのアイコンに出す (編集中のときだけ。離れたら消す)
  useEffect(() => {
    if (readOnly) return;
    publishSaveState({ status, errorMessage, retry: () => void save() });
  }, [readOnly, status, errorMessage, save]);
  useEffect(() => () => publishSaveState(null), []);

  // 未保存の内容がある間はタブを閉じる / リロード前に確認を出す
  const unsaved = status !== "saved";
  useEffect(() => {
    if (!unsaved) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [unsaved]);

  // オフラインで保存できていない変更がある間は、SPA 内の遷移も確認してから (アンマウント時の
  // 保存が届かず、入力内容が失われるため)。オンラインなら unmount 時にその場で保存するので確認しない
  const blockNavigation = status === "offline" || (unsaved && isOffline());
  const confirmLeave = useCallback(
    () =>
      !window.confirm(
        "オフラインのため未保存の変更を保存できません。このページを離れると変更は失われます。移動しますか?",
      ),
    [],
  );
  useBlocker({
    shouldBlockFn: confirmLeave,
    disabled: !blockNavigation,
    // beforeunload は上の useEffect で扱う
    enableBeforeUnload: false,
  });

  return { update };
}
