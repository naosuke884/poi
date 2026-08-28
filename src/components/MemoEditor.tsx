import { Anchor, Button, Group, Loader, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MEMO_CONTENT_MAX_LENGTH,
  MEMO_TITLE_MAX_LENGTH,
  MEMO_TTL_DAYS,
} from "../../worker/memo/constants";
import { api } from "@/lib/api";
import { formatDate, type MemoDetail } from "@/lib/memo";

// 入力停止からこの時間だけ待ってから保存する
const AUTOSAVE_DELAY_MS = 1000;

type Draft = { title: string; content: string };

// 遷移をまたいで入力を続けられるよう、どの欄にカーソルがあったかも引き継ぐ
type Focus = { field: keyof Draft; start: number | null; end: number | null };

type SaveStatus =
  | "idle" // 新規で、まだ何も入力していない
  | "dirty" // 未保存の変更がある (debounce 待ち)
  | "empty" // 本文が空なので保存できない
  | "saving"
  | "saved"
  | "error";

// /memos/new で POST した直後に /memos/$id へ replace 遷移すると、ルートが変わるため
// エディタは一度アンマウントされる。遷移中もユーザーは入力を続けられるので、
// その未保存分を遷移先のエディタへ引き継ぐための一時置き場。
// getter にしておき、遷移先が最初にレンダーされる時点での最新の入力を渡す。
let handoff: { id: string; getDraft: () => Draft; getFocus: () => Focus | null } | null = null;

function peekHandoff(id: string) {
  return handoff?.id === id ? handoff : null;
}

function clearHandoff(id: string) {
  if (handoff?.id === id) handoff = null;
}

function isSameDraft(a: Draft, b: Draft) {
  return a.title === b.title && a.content === b.content;
}

function draftOf(memo: MemoDetail | null): Draft {
  return { title: memo?.title ?? "", content: memo?.content ?? "" };
}

/**
 * メモの作成・編集画面で共有するエディタ。
 * memo が null なら新規: 最初の入力で POST し、/memos/$id へ replace 遷移する。
 * 以後は入力停止から 1 秒後に PATCH する (自動保存)。
 */
export function MemoEditor({ memo }: { memo: MemoDetail | null }) {
  const navigate = useNavigate();

  // 新規作成からの replace 遷移直後なら、前のエディタから下書きとカーソル位置を引き継ぐ。
  // 前のエディタの DOM はこのレンダー後のコミットで消えるので、render 中に読んでおく必要がある
  const [handed] = useState(() => {
    const h = memo && peekHandoff(memo.id);
    return h ? { draft: h.getDraft(), focus: h.getFocus() } : null;
  });

  // サーバに保存済みの値 (比較用) と、画面上の最新の値
  const savedRef = useRef<Draft>(draftOf(memo));
  const [draft, setDraft] = useState<Draft>(handed?.draft ?? draftOf(memo));
  const latestRef = useRef(draft);
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const [id, setId] = useState(memo?.id ?? null);
  const idRef = useRef(id);
  const [expiresAt, setExpiresAt] = useState(memo?.expiresAt ?? null);

  const [status, setStatus] = useState<SaveStatus>(() => {
    if (!memo) return "idle";
    return isSameDraft(latestRef.current, savedRef.current) ? "saved" : "dirty";
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  // POST 後に /memos/$id へ遷移したら、このインスタンスからは保存しない
  // (遷移先のエディタと PATCH が競合して古い内容で上書きしないように)
  const handedOffRef = useRef(false);
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
    if (inFlightRef.current || handedOffRef.current) return;

    const snapshot = latestRef.current;
    if (isSameDraft(snapshot, savedRef.current)) {
      setStatus(idRef.current === null ? "idle" : "saved");
      return;
    }
    // API は content を 1 文字以上要求するので、本文が空の間は保存しない
    if (snapshot.content === "") {
      setStatus("empty");
      return;
    }

    inFlightRef.current = true;
    setStatus("saving");
    setErrorMessage(null);
    const json = { title: snapshot.title === "" ? null : snapshot.title, content: snapshot.content };

    let saved = false;
    try {
      if (idRef.current === null) {
        const res = await api.memos.$post({ json });
        if (res.status !== 201) throw new Error(`保存に失敗しました (${res.status})`);
        const { memo: created } = await res.json();
        savedRef.current = snapshot;
        idRef.current = created.id;
        setId(created.id);
        setExpiresAt(created.expiresAt);
        setStatus("saved");
        // 遷移中に入力された分は遷移先のエディタが引き継いで保存する
        handedOffRef.current = true;
        handoff = {
          id: created.id,
          getDraft: () => latestRef.current,
          getFocus: () => {
            const active = document.activeElement;
            const field =
              active === titleRef.current
                ? "title"
                : active === contentRef.current
                  ? "content"
                  : null;
            if (!field) return null;
            const el = active as HTMLInputElement | HTMLTextAreaElement;
            return { field, start: el.selectionStart, end: el.selectionEnd };
          },
        };
        void navigate({ to: "/memos/$id", params: { id: created.id }, replace: true });
        return;
      }

      const res = await api.memos[":id"].$patch({ param: { id: idRef.current }, json });
      if (res.status === 404) {
        throw new Error("このメモは期限切れか、既に削除されています");
      }
      if (!res.ok) throw new Error(`保存に失敗しました (${res.status})`);
      savedRef.current = snapshot;
      saved = true;
      setStatus("saved");
    } catch (e) {
      setStatus("error");
      setErrorMessage(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      inFlightRef.current = false;
    }

    // 保存中にさらに入力があれば、debounce を挟んで続けて保存する (失敗時は「再試行」に任せる)。
    // 即座に保存すると入力が続く限り PATCH が連発するので、通常の自動保存と同じ待ち時間を置く
    if (saved && !isSameDraft(latestRef.current, savedRef.current)) {
      cancelTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void save();
      }, AUTOSAVE_DELAY_MS);
    }
  }, [navigate]);

  const scheduleSave = useCallback(() => {
    cancelTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void save();
    }, AUTOSAVE_DELAY_MS);
  }, [save]);

  const update = (patch: Partial<Draft>) => {
    const next = { ...latestRef.current, ...patch };
    latestRef.current = next;
    setDraft(next);
    if (isSameDraft(next, savedRef.current)) {
      cancelTimer();
      setStatus(idRef.current === null ? "idle" : "saved");
      return;
    }
    // 保存中は「保存中…」のまま (完了後に続けて保存されるので、その時点で状態が更新される)
    if (!inFlightRef.current) setStatus(next.content === "" ? "empty" : "dirty");
    scheduleSave();
  };

  // マウント時: 引き継いだカーソル位置を復元し、未保存分があれば保存を予約する。
  // アンマウント時: タイマーと引き継ぎ情報を片付ける。
  useEffect(() => {
    const focus = handed?.focus;
    if (focus) {
      const el = focus.field === "title" ? titleRef.current : contentRef.current;
      el?.focus();
      if (focus.start !== null && focus.end !== null) el?.setSelectionRange(focus.start, focus.end);
    }
    if (idRef.current !== null) clearHandoff(idRef.current);
    if (!isSameDraft(latestRef.current, savedRef.current)) scheduleSave();
    return () => {
      cancelTimer();
      if (idRef.current !== null) clearHandoff(idRef.current);
    };
    // マウント時に一度だけ実行する (handed / scheduleSave はマウント後に変わらない)
  }, []);

  // 未保存の内容がある間はタブを閉じる / リロード前に確認を出す
  const unsaved = status === "dirty" || status === "saving" || status === "error";
  useEffect(() => {
    if (!unsaved) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [unsaved]);

  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Anchor component={Link} to="/" size="sm">
          ← 一覧へ戻る
        </Anchor>
        <SaveStatusLabel status={status} errorMessage={errorMessage} onRetry={() => void save()} />
      </Group>

      <Text size="sm" c="dimmed">
        {expiresAt
          ? `期限: このメモは ${formatDate(expiresAt)} に消えます`
          : `期限: 保存すると、このメモは作成から ${MEMO_TTL_DAYS} 日後に消えます`}
      </Text>

      <TextInput
        placeholder="タイトル (省略可)"
        aria-label="タイトル"
        value={draft.title}
        onChange={(e) => update({ title: e.currentTarget.value })}
        maxLength={MEMO_TITLE_MAX_LENGTH}
        size="lg"
        variant="unstyled"
        styles={{ input: { fontWeight: 700 } }}
        ref={titleRef}
      />
      <Textarea
        placeholder="本文を入力すると自動的に保存されます"
        aria-label="本文"
        value={draft.content}
        onChange={(e) => update({ content: e.currentTarget.value })}
        maxLength={MEMO_CONTENT_MAX_LENGTH}
        autosize
        minRows={12}
        autoFocus={id === null}
        ref={contentRef}
      />
      <Group justify="flex-end" gap="md">
        <CharCount label="タイトル" length={draft.title.length} max={MEMO_TITLE_MAX_LENGTH} />
        <CharCount label="本文" length={draft.content.length} max={MEMO_CONTENT_MAX_LENGTH} />
      </Group>
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
    case "idle":
      return null;
    case "dirty":
      return (
        <Text size="sm" c="dimmed">
          未保存の変更があります
        </Text>
      );
    case "empty":
      return (
        <Text size="sm" c="dimmed">
          本文が空のため保存されません
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

function CharCount({ label, length, max }: { label: string; length: number; max: number }) {
  return (
    <Text size="xs" c={length >= max ? "red" : "dimmed"}>
      {label} {length.toLocaleString()} / {max.toLocaleString()}
    </Text>
  );
}
