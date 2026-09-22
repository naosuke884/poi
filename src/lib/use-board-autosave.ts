import { useBlocker } from "@tanstack/react-router";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  type BoardSection,
  type DraftSection,
  type EditableSection,
  overLimitMessage,
  sameDraft,
  toDraft,
  toPutPayload,
  toSaved,
} from "@/lib/board";
import { writeCachedBoard } from "@/lib/board-cache";
import { OfflineError, fetchOrOffline, isOffline } from "@/lib/offline";
import { publishSaveState, type SaveStatus } from "@/lib/save-status";

// 入力停止からこの時間だけ待ってから保存する
const AUTOSAVE_DELAY_MS = 1000;

/**
 * 板を保存し (PUT /api/board)、成功したらオフライン閲覧用のキャッシュも更新して、保存後のセクションを返す。
 * 通常の自動保存とアンマウント時の保存の両方がこれを通る (どちらの経路でもキャッシュが古いまま残らないように)。
 * 上限の確認は呼び出し側で済ませておく
 */
async function putBoard(userId: string, draft: DraftSection[]): Promise<BoardSection[]> {
  const res = await api.board.$put({ json: toPutPayload(draft) });
  if (!res.ok) throw new Error(`保存に失敗しました (${res.status})`);
  const { sections } = await res.json();
  writeCachedBoard(userId, sections);
  return sections;
}

/**
 * 板の自動保存と保存状態。編集操作はすべて update() を通す (状態を更新し、自動保存を予約する)。
 * - 入力停止から 1 秒後に丸ごと保存し、保存状態はヘッダーのアイコン (SaveStatusIcon) に出す
 * - アンマウント時は debounce 待ちの編集をその場で保存し、未保存の間はタブを閉じる /
 *   リロード / SPA 内の遷移 (オフライン時) の前に確認を出す
 * - オフラインの間は送らずに待ち、online イベントで再送する
 * latestRef / commit は useBoardSections が持つ画面上のセクション (state は描画用、処理は ref を読む)。
 * commit は状態の差し替えだけで、保存後にサーバの id / 期限を戻すのにも使う
 */
export function useBoardAutosave({
  initial,
  userId,
  readOnly,
  latestRef,
  commit,
}: {
  initial: BoardSection[];
  userId: string;
  readOnly: boolean;
  latestRef: RefObject<EditableSection[]>;
  commit: (next: EditableSection[]) => void;
}) {
  // サーバに保存済みのもの (差分の有無の判定用)
  const savedRef = useRef<DraftSection[]>(toSaved(initial));

  const [status, setStatus] = useState<SaveStatus>("saved");
  const statusRef = useRef(status);
  statusRef.current = status;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const save = useCallback(async () => {
    cancelTimer();
    // 保存中なら何もしない (完了時に最新の内容と比べて、差分があれば続けて保存する)
    if (inFlightRef.current) return;

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

    let saved = false;
    try {
      const updated = await fetchOrOffline(() => putBoard(userId, draft));
      savedRef.current = toSaved(updated);
      // レスポンスは送った順に並ぶ (position 順) ので、送ったセクションにサーバの id と期限を戻す。
      // 送っていない (空だった) セクションはサーバから消えているので id を外す。
      // 保存中の入力 (content) はそのまま残す (差分があれば続けて保存される)
      const byKey = new Map(draft.map((d, i) => [d.key, updated[i]]));
      commit(
        latestRef.current.map((s) => {
          const u = byKey.get(s.key);
          if (u) return { ...s, id: u.id, expiresAt: u.expiresAt };
          return s.id === null ? s : { ...s, id: null, expiresAt: null };
        }),
      );
      saved = true;
      setStatus("saved");
    } catch (e) {
      if (e instanceof OfflineError) {
        // 入力内容はそのまま保持し、オンライン復帰時に再送する
        setStatus("offline");
      } else {
        setStatus("error");
        setErrorMessage(e instanceof Error ? e.message : "保存に失敗しました");
      }
    } finally {
      inFlightRef.current = false;
    }

    // 保存中にさらに入力があれば、debounce を挟んで続けて保存する (失敗時は「再試行」に任せる)。
    // 即座に保存すると入力が続く限り PUT が連発するので、通常の自動保存と同じ待ち時間を置く
    if (saved && !sameDraft(toDraft(latestRef.current), savedRef.current)) {
      cancelTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void save();
      }, AUTOSAVE_DELAY_MS);
    }
  }, [userId]);

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
      setStatus("saved");
      return;
    }
    // 保存中は「保存中…」のまま (完了後に続けて保存されるので、その時点で状態が更新される)
    if (!inFlightRef.current) setStatus("dirty");
    scheduleSave();
  };

  // アンマウント時: タイマーを片付け、debounce 待ちの編集があればその場で保存する。
  // 保存中なら完了時のフォローアップ保存 (save 内のタイマー) に任せる。
  // オフラインなら送っても届かない (離脱前に useBlocker で確認済み) ので何もしない
  useEffect(() => {
    return () => {
      cancelTimer();
      const draft = toDraft(latestRef.current);
      if (
        !inFlightRef.current &&
        !isOffline() &&
        !sameDraft(draft, savedRef.current)
      ) {
        if (overLimitMessage(draft) !== null) return;
        void putBoard(userId, draft).catch(() => {
          // 離脱後なので UI には出せない。ネットワーク断ならその編集は失われる (スコープ外)
        });
      }
    };
    // マウント時に一度だけ実行する (readOnly はマウント後に変わらない: 変わるときは key で作り直される)
  }, []);

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
