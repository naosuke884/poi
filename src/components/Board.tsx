import { Button, Group, Loader, Stack, Text, Textarea } from "@mantine/core";
import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { BOARD_MAX_LENGTH, BOARD_MAX_SECTIONS, MEMO_TTL_DAYS } from "../../worker/memo/constants";
import { api } from "@/lib/api";
import {
  type BoardSection,
  diffSections,
  formatDate,
  joinSections,
  splitSections,
} from "@/lib/board";
import { writeCachedBoard } from "@/lib/board-cache";
import { OfflineError, fetchOrOffline, isOffline } from "@/lib/offline";

// 入力停止からこの時間だけ待ってから保存する
const AUTOSAVE_DELAY_MS = 1000;

export const OFFLINE_SAVE_MESSAGE = "オフラインです。オンライン復帰後に再保存してください";

type SaveStatus =
  | "dirty" // 未保存の変更がある (debounce 待ち)
  | "saving"
  | "saved"
  | "offline" // オフラインで保存できなかった (入力は保持。online イベントか「再試行」で再送する)
  | "error";

/**
 * 板 (1 枚の Textarea)。空行で区切った各セクションが 1 つの memo で、セクションごとに 30 日で消える。
 * 入力停止から 1 秒後に PUT /api/board で丸ごと保存する (自動保存)。
 * 保存時は前回保存したセクションと突き合わせて id を引き継ぎ (diffSections)、セクションごとの期限を維持する。
 * userId は保存成功時にオフライン閲覧用キャッシュを更新するためのキー。
 * readOnly はオフラインでキャッシュから表示しているとき (入力不可・保存しない)。
 */
export function Board({
  sections,
  userId,
  readOnly = false,
}: {
  sections: BoardSection[];
  userId: string;
  readOnly?: boolean;
}) {
  // サーバに保存済みのセクション (id 引き継ぎと比較用) と、画面上の最新のテキスト
  const savedRef = useRef<BoardSection[]>(sections);
  const [savedSections, setSavedSections] = useState(sections);
  const [text, setText] = useState(() => joinSections(sections));
  const latestRef = useRef(text);

  const [status, setStatus] = useState<SaveStatus>("saved");
  const statusRef = useRef(status);
  statusRef.current = status;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

    const snapshot = latestRef.current;
    if (snapshot === joinSections(savedRef.current)) {
      setStatus("saved");
      return;
    }
    const draft = splitSections(snapshot);
    if (draft.length > BOARD_MAX_SECTIONS) {
      setStatus("error");
      setErrorMessage(`セクション数が上限 (${BOARD_MAX_SECTIONS.toLocaleString()}) を超えています`);
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
      const json = { sections: diffSections(savedRef.current, draft) };
      const res = await fetchOrOffline(() => api.board.$put({ json }));
      if (!res.ok) throw new Error(`保存に失敗しました (${res.status})`);
      const { sections: updated } = await res.json();
      writeCachedBoard(userId, updated);
      savedRef.current = updated;
      setSavedSections(updated);
      saved = true;
      setStatus("saved");
    } catch (e) {
      if (e instanceof OfflineError) {
        // 入力内容 (latestRef / text) はそのまま保持し、オンライン復帰時に再送する
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
    if (saved && latestRef.current !== joinSections(savedRef.current)) {
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

  const update = (next: string) => {
    latestRef.current = next;
    setText(next);
    if (next === joinSections(savedRef.current)) {
      cancelTimer();
      setStatus("saved");
      return;
    }
    // 保存中は「保存中…」のまま (完了後に続けて保存されるので、その時点で状態が更新される)
    if (!inFlightRef.current) setStatus("dirty");
    scheduleSave();
  };

  // マウント時: 末尾から書き足せるようカーソルを最後に置く (autoFocus は先頭に置くため)。
  // アンマウント時: タイマーを片付け、debounce 待ちの編集があればその場で保存する。
  // 保存中なら完了時のフォローアップ保存 (save 内のタイマー) に任せる。
  // オフラインなら送っても届かない (離脱前に useBlocker で確認済み) ので何もしない
  useEffect(() => {
    const el = textareaRef.current;
    if (el && !readOnly) el.setSelectionRange(el.value.length, el.value.length);
    return () => {
      cancelTimer();
      const snapshot = latestRef.current;
      if (
        !inFlightRef.current &&
        !isOffline() &&
        snapshot !== joinSections(savedRef.current)
      ) {
        const draft = splitSections(snapshot);
        if (draft.length > BOARD_MAX_SECTIONS) return;
        const json = { sections: diffSections(savedRef.current, draft) };
        void api.board.$put({ json }).catch(() => {
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

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Text size="sm" c="dimmed">
          <ExpiryNote sections={savedSections} />
        </Text>
        {!readOnly && (
          <SaveStatusLabel status={status} errorMessage={errorMessage} onRetry={() => void save()} />
        )}
      </Group>

      <Textarea
        placeholder={
          `ここに書くと自動的に保存されます\n` +
          `空行で区切るとセクションになり、セクションごとに ${MEMO_TTL_DAYS} 日で消えます`
        }
        aria-label="板"
        value={text}
        onChange={(e) => update(e.currentTarget.value)}
        maxLength={BOARD_MAX_LENGTH}
        autosize
        minRows={16}
        autoFocus={!readOnly}
        readOnly={readOnly}
        ref={textareaRef}
      />
      <Text size="xs" c={text.length >= BOARD_MAX_LENGTH ? "red" : "dimmed"} ta="right">
        {text.length.toLocaleString()} / {BOARD_MAX_LENGTH.toLocaleString()}
      </Text>
    </Stack>
  );
}

// 「各セクションは 30 日で消える」ことと、保存済みのセクションのうち一番早く消える日を出す
function ExpiryNote({ sections }: { sections: BoardSection[] }) {
  const base = `空行で区切った各セクションは書いてから ${MEMO_TTL_DAYS} 日で消えます`;
  if (sections.length === 0) return base;
  const earliest = sections.reduce((min, s) => {
    const t = new Date(s.expiresAt).getTime();
    return t < min ? t : min;
  }, Number.POSITIVE_INFINITY);
  return `${base} (次に消えるのは ${formatDate(earliest)})`;
}

function SaveStatusLabel({
  status,
  errorMessage,
  onRetry,
}: {
  status: SaveStatus;
  errorMessage: string | null;
  onRetry: () => void;
}) {
  switch (status) {
    case "dirty":
      return (
        <Text size="sm" c="dimmed">
          未保存の変更があります
        </Text>
      );
    case "saving":
      return (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            保存中…
          </Text>
        </Group>
      );
    case "saved":
      return (
        <Text size="sm" c="dimmed">
          保存済み
        </Text>
      );
    case "offline":
      return (
        <Group gap="xs" role="alert">
          <Text size="sm" c="orange" fw={600}>
            {OFFLINE_SAVE_MESSAGE}
          </Text>
          <Button size="compact-xs" variant="light" color="orange" onClick={onRetry}>
            再試行
          </Button>
        </Group>
      );
    case "error":
      return (
        <Group gap="xs" role="alert">
          <Text size="sm" c="red" fw={600}>
            保存に失敗{errorMessage ? `: ${errorMessage}` : ""}
          </Text>
          <Button size="compact-xs" variant="light" color="red" onClick={onRetry}>
            再試行
          </Button>
        </Group>
      );
  }
}
