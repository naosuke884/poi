import { Button, CloseButton, Group, Loader, Stack, Text, Textarea } from "@mantine/core";
import { useBlocker } from "@tanstack/react-router";
import { type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BOARD_MAX_LENGTH,
  BOARD_MAX_SECTIONS,
  MEMO_TTL_DAYS,
  boardLength,
} from "../../worker/memo/constants";
import { api } from "@/lib/api";
import {
  type BoardSection,
  type DraftSection,
  type EditableSection,
  formatDate,
  newSection,
  sameDraft,
  splitAtSeparator,
  toDraft,
  toEditable,
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
 * 板。セクション (= 1 つの memo、30 日で消える) ごとに 1 つの Textarea を縦に並べる。
 * - 空行 (改行 2 つ) を入力するとそこでセクションが分かれて次の Textarea へ移る。
 *   先頭で Backspace / 末尾で Delete で隣と結合、↑↓ で隣の Textarea へ移る (Notion のブロック風)
 * - 各 Textarea が自分の id を持つので、保存はそのまま PUT /api/board に送るだけ (id が期限を引き継ぐ)。
 *   空のセクションは送らない (画面には残る)
 * - 入力停止から 1 秒後に丸ごと保存する (自動保存)
 * userId は保存成功時にオフライン閲覧用キャッシュを更新するためのキー。
 * readOnly はオフラインでキャッシュから表示しているとき (入力不可・保存しない)。
 */
export function Board({
  sections: initial,
  userId,
  readOnly = false,
}: {
  sections: BoardSection[];
  userId: string;
  readOnly?: boolean;
}) {
  // 画面上のセクション。state は描画用で、ハンドラや保存処理は常に latestRef (同じ内容) を読む
  const [sections, setSections] = useState<EditableSection[]>(() => {
    const s = toEditable(initial);
    return s.length > 0 ? s : [newSection()];
  });
  const latestRef = useRef(sections);
  // サーバに保存済みのもの (差分の有無の判定用)
  const savedRef = useRef<DraftSection[]>(initial.map(({ id, content }) => ({ id, content })));

  const [status, setStatus] = useState<SaveStatus>("saved");
  const statusRef = useRef(status);
  statusRef.current = status;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // key → Textarea 要素。分割 / 結合 / ↑↓ の後にカーソルを移すのに使う
  const elementsRef = useRef(new Map<string, HTMLTextAreaElement>());
  // 次の描画後にカーソルを置く先 (state を変える操作で使う。描画を待たないと新しい Textarea が無い)
  const pendingFocusRef = useRef<{ key: string; pos: number } | null>(null);
  const focus = (key: string, pos: number) => {
    const el = elementsRef.current.get(key);
    if (!el) return;
    el.focus();
    el.setSelectionRange(pos, pos);
  };
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    focus(pending.key, pending.pos);
  });

  const cancelTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const commit = (next: EditableSection[]) => {
    latestRef.current = next;
    setSections(next);
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
    if (draft.length > BOARD_MAX_SECTIONS) {
      setStatus("error");
      setErrorMessage(`セクション数が上限 (${BOARD_MAX_SECTIONS.toLocaleString()}) を超えています`);
      return;
    }
    if (boardLength(draft) > BOARD_MAX_LENGTH) {
      setStatus("error");
      setErrorMessage(`文字数が上限 (${BOARD_MAX_LENGTH.toLocaleString()}) を超えています`);
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
      const json = { sections: draft.map(({ id, content }) => ({ id, content })) };
      const res = await fetchOrOffline(() => api.board.$put({ json }));
      if (!res.ok) throw new Error(`保存に失敗しました (${res.status})`);
      const { sections: updated } = await res.json();
      writeCachedBoard(userId, updated);
      savedRef.current = updated.map(({ id, content }) => ({ id, content }));
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

  const indexOf = (key: string) => latestRef.current.findIndex((s) => s.key === key);

  // 入力。区切り (空行) が入ったらそこで分ける。最初の部分が元のセクション (id を保ち期限を維持)、残りは新しいセクション
  const changeSection = (key: string, value: string, cursor: number) => {
    const cur = latestRef.current;
    const i = indexOf(key);
    const split = splitAtSeparator(value, cursor);
    if (!split) {
      update(cur.map((s) => (s.key === key ? { ...s, content: value } : s)));
      return;
    }
    const parts = split.parts.map((content, j) =>
      j === 0 ? { ...cur[i]!, content } : newSection(content),
    );
    pendingFocusRef.current = { key: parts[split.focus.index]!.key, pos: split.focus.offset };
    update([...cur.slice(0, i), ...parts, ...cur.slice(i + 1)]);
  };

  // i 番目と i+1 番目をつなげる (前のセクションが id を保つ)。カーソルはつなぎ目に置く
  const mergeSections = (i: number) => {
    const cur = latestRef.current;
    const a = cur[i];
    const b = cur[i + 1];
    if (!a || !b) return;
    pendingFocusRef.current = { key: a.key, pos: a.content.length };
    update([...cur.slice(0, i), { ...a, content: a.content + b.content }, ...cur.slice(i + 2)]);
  };

  const removeSection = (key: string) => {
    const next = latestRef.current.filter((s) => s.key !== key);
    update(next.length > 0 ? next : [newSection()]);
  };

  // 隣のセクションとの結合 / 移動。文字変換中 (IME) のキーは触らない
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, i: number) => {
    if (e.nativeEvent.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const cur = latestRef.current;
    const { selectionStart, selectionEnd, value } = e.currentTarget;
    const collapsed = selectionStart === selectionEnd;
    switch (e.key) {
      case "Backspace":
        if (collapsed && selectionStart === 0 && i > 0) {
          e.preventDefault();
          mergeSections(i - 1);
        }
        break;
      case "Delete":
        if (collapsed && selectionStart === value.length && i < cur.length - 1) {
          e.preventDefault();
          mergeSections(i);
        }
        break;
      case "ArrowUp":
        // 1 行目 (折り返しは考えない) なら前のセクションの末尾へ
        if (collapsed && i > 0 && !value.slice(0, selectionStart).includes("\n")) {
          e.preventDefault();
          const prev = cur[i - 1]!;
          focus(prev.key, prev.content.length);
        }
        break;
      case "ArrowDown":
        if (collapsed && i < cur.length - 1 && !value.slice(selectionStart).includes("\n")) {
          e.preventDefault();
          focus(cur[i + 1]!.key, 0);
        }
        break;
    }
  };

  // マウント時: 末尾から書き足せるよう最後のセクションの末尾にカーソルを置く。
  // アンマウント時: タイマーを片付け、debounce 待ちの編集があればその場で保存する。
  // 保存中なら完了時のフォローアップ保存 (save 内のタイマー) に任せる。
  // オフラインなら送っても届かない (離脱前に useBlocker で確認済み) ので何もしない
  useEffect(() => {
    if (!readOnly) {
      const last = latestRef.current.at(-1);
      if (last) focus(last.key, last.content.length);
    }
    return () => {
      cancelTimer();
      const draft = toDraft(latestRef.current);
      if (!inFlightRef.current && !isOffline() && !sameDraft(draft, savedRef.current)) {
        if (draft.length > BOARD_MAX_SECTIONS || boardLength(draft) > BOARD_MAX_LENGTH) return;
        const json = { sections: draft.map(({ id, content }) => ({ id, content })) };
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

  const length = boardLength(toDraft(sections));

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Text size="sm" c="dimmed">
          各セクションは書いてから {MEMO_TTL_DAYS} 日で消えます
        </Text>
        {!readOnly && (
          <SaveStatusLabel status={status} errorMessage={errorMessage} onRetry={() => void save()} />
        )}
      </Group>

      {sections.map((s, i) => (
        <Stack key={s.key} gap={4}>
          <Textarea
            aria-label={`セクション ${i + 1}`}
            placeholder={
              sections.length === 1
                ? `ここに書くと自動的に保存されます\n` +
                  `空行 (Enter 2 回) で次のセクションに移り、セクションごとに ${MEMO_TTL_DAYS} 日で消えます`
                : undefined
            }
            value={s.content}
            onChange={(e) => changeSection(s.key, e.currentTarget.value, e.currentTarget.selectionStart)}
            onKeyDown={(e) => onKeyDown(e, i)}
            maxLength={BOARD_MAX_LENGTH}
            autosize
            minRows={1}
            readOnly={readOnly}
            ref={(el) => {
              if (el) elementsRef.current.set(s.key, el);
              else elementsRef.current.delete(s.key);
            }}
          />
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Text size="xs" c="dimmed">
              {s.expiresAt !== null
                ? `${formatDate(s.expiresAt)} に消えます`
                : `新しいセクション (保存してから ${MEMO_TTL_DAYS} 日で消えます)`}
            </Text>
            {!readOnly && (
              <CloseButton
                size="sm"
                aria-label={`セクション ${i + 1} を削除`}
                onClick={() => removeSection(s.key)}
              />
            )}
          </Group>
        </Stack>
      ))}

      <Text size="xs" c={length >= BOARD_MAX_LENGTH ? "red" : "dimmed"} ta="right">
        {length.toLocaleString()} / {BOARD_MAX_LENGTH.toLocaleString()}
      </Text>
    </Stack>
  );
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
