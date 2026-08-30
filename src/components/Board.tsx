import {
  Affix,
  Box,
  Button,
  CloseButton,
  Divider,
  Group,
  Notification,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useBlocker } from "@tanstack/react-router";
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
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
  daysUntil,
  formatDate,
  newKey,
  newSection,
  sameDraft,
  splitAtSeparator,
  toDraft,
  toEditable,
} from "@/lib/board";
import { writeCachedBoard } from "@/lib/board-cache";
import { MarkdownView } from "@/components/MarkdownView";
import { SectionActions } from "@/components/SectionActions";
import { SectionEditor, type SectionEditorHandle } from "@/components/SectionEditor";
import { OfflineError, fetchOrOffline, isOffline } from "@/lib/offline";
import { publishSaveState, type SaveStatus } from "@/lib/save-status";
import { copySectionText, deliverImage, renderSectionImage } from "@/lib/section-export";

// 入力停止からこの時間だけ待ってから保存する
const AUTOSAVE_DELAY_MS = 1000;
// セクションを削除したあと「元に戻す」を出しておく時間
const UNDO_DELETE_MS = 8000;

/**
 * 板。セクション (= 1 つの memo、30 日で消える) を縦に並べる。
 * 見た目は 1 枚の文書: 枠なしで画面いっぱいに広げ、セクションの境界は期限ラベル付きの区切り線で示す。
 * 編集中 (フォーカスのある) セクションだけエディタ (SectionEditor = CodeMirror。Markdown ソースのまま、
 * 見出し・記号・URL を装飾して表示する) で、それ以外は Markdown をレンダリングして表示する (MarkdownView。
 * クリックするとエディタに戻る)。内容はそのまま Markdown テキストとして保存する
 * - 空行 2 つ (改行 3 つ) を入力するとそこでセクションが分かれて次のセクションへ移る (空行 1 つはセクションの中に残る)。
 *   先頭で Backspace / 末尾で Delete で隣と結合、↑↓ で隣のセクションへ移る (Notion のブロック風)。Tab で編集をやめる (Markdown 表示に戻る)。
 *   境界の判定はエディタが行い (SectionEditor のコールバック)、ここでは何をするかだけ決める。
 *   分割 / 結合ではフォーカスのあるエディタの DOM (key) をそのまま使い回し、カーソルだけ動かす
 *   (エディタを作り直してフォーカスを移すと、タッチ端末ではキーボードが閉じたり新しいエディタに
 *   フォーカスが渡らなかったりする)
 * - 各セクションが自分の id を持つので、保存はそのまま PUT /api/board に送るだけ (id が期限を引き継ぐ)。
 *   空のセクションは送らない (画面には残る)
 * - 入力停止から 1 秒後に丸ごと保存する (自動保存)。保存状態はヘッダーのアイコン (SaveStatusIcon) に出す
 * - 区切り線のボタンでセクションをコピー (Markdown テキスト) / スクショ (Markdown 表示を PNG に) できる
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

  // key → エディタのハンドル。分割 / 結合 / ↑↓ の後にカーソルを移すのに使う
  const elementsRef = useRef(new Map<string, SectionEditorHandle>());
  // key → Markdown 表示の要素 (スクショの対象)
  const viewsRef = useRef(new Map<string, HTMLDivElement>());
  // key → セクションの外枠 (区切り線を含む。スクロール位置を合わせる対象)
  const boxesRef = useRef(new Map<string, HTMLDivElement>());
  // 次の描画後にカーソルを置く先 (state を変える操作で使う。描画を待たないと新しいエディタが無い)
  const pendingFocusRef = useRef<{ key: string; pos: number } | null>(null);
  // Tab で編集をやめたセクション。描画後にその Markdown 表示へフォーカスを移す (次の Tab はそこから先へ進み、
  // Enter で編集に戻れる)。空のセクションは Markdown 表示が無いので何もしない
  const pendingViewFocusRef = useRef<string | null>(null);
  // 編集中 (エディタで表示する) セクション。それ以外は Markdown 表示。null はどれも編集していない。
  // 開いた直後はどれも編集していない (全部 Markdown 表示。タップ / クリックでエディタに切り替わる)
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // 描画後にカーソルを置く (エディタがまだ無いセクションを編集状態にしてから)
  const focusLater = (key: string, pos: number) => {
    pendingFocusRef.current = { key, pos };
    setEditingKey(key);
  };
  const focus = (key: string, pos: number) => {
    const editor = elementsRef.current.get(key);
    if (!editor) {
      focusLater(key, pos);
      return;
    }
    setEditingKey(key);
    editor.focus(pos);
  };
  // SectionEditor は自分の layout effect (親より先に走る) で value を doc に反映済みなので、ここで置く
  // カーソル位置は新しい内容に対するもの
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const editor = elementsRef.current.get(pending.key);
    if (!editor) return; // 次の描画でエディタが現れるまで待つ
    pendingFocusRef.current = null;
    editor.focus(pending.pos);
  });
  useLayoutEffect(() => {
    const key = pendingViewFocusRef.current;
    if (key === null) return;
    pendingViewFocusRef.current = null;
    viewsRef.current.get(key)?.focus({ preventScroll: true });
  });

  // 最後のセクションの冒頭 (区切り線) が画面の上端 (ヘッダーの下) に来るようにスクロールする。
  // 開いたときと、末尾に新しいセクションができたときに使う (下端に張り付いたまま書き続けなくて済むように)。
  // 描画後に行う (末尾のセクションがまだ無いことがある)。同じ key でも毎回動かすので値はオブジェクトで持つ。
  // 上の effect (フォーカス) より後に置く: フォーカスでカーソル位置へスクロールした後に、こちらで上書きする
  // (SectionEditor の focus はそのためにカーソルへのスクロールを同期的に済ませる)
  const [reveal, setReveal] = useState<{ key: string } | null>(null);
  const revealLast = () => {
    const last = latestRef.current.at(-1);
    if (last) setReveal({ key: last.key });
  };
  useLayoutEffect(() => {
    if (!reveal) return;
    boxesRef.current.get(reveal.key)?.scrollIntoView({ block: "start" });
  }, [reveal]);

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

  // 入力。区切り (空行 2 つ) が入ったらそこで分ける。
  // 最初の部分が id (期限) を引き継ぎ、カーソルの行き先の部分が key (= 今フォーカスのあるエディタの DOM) を引き継ぐ。
  // 残りは新しいセクション
  const changeSection = (key: string, value: string, cursor: number) => {
    const cur = latestRef.current;
    const i = indexOf(key);
    const orig = cur[i];
    if (!orig) return;
    const split = splitAtSeparator(value, cursor);
    if (!split) {
      update(cur.map((s) => (s.key === key ? { ...s, content: value } : s)));
      return;
    }
    const parts = split.parts.map(
      (content, j): EditableSection => ({
        key: j === split.focus.index ? orig.key : newKey(),
        id: j === 0 ? orig.id : null,
        expiresAt: j === 0 ? orig.expiresAt : null,
        content,
      }),
    );
    focusLater(orig.key, split.focus.offset);
    update([...cur.slice(0, i), ...parts, ...cur.slice(i + 1)]);
    // 末尾に新しいセクションができてそこへ移るなら、その冒頭を画面の上端に持ってくる
    if (i === cur.length - 1 && split.focus.index === parts.length - 1) revealLast();
  };

  // i 番目と i+1 番目をつなげる。前のセクションが id (期限) を保ち、フォーカスのある方 (focused) が key を保つ。
  // カーソルはつなぎ目に置く
  const mergeSections = (i: number, focused: string) => {
    const cur = latestRef.current;
    const a = cur[i];
    const b = cur[i + 1];
    if (!a || !b) return;
    const merged: EditableSection = {
      key: focused,
      id: a.id,
      expiresAt: a.expiresAt,
      content: a.content + b.content,
    };
    focusLater(focused, a.content.length);
    update([...cur.slice(0, i), merged, ...cur.slice(i + 2)]);
  };

  // 削除は即時に反映し (1 秒後に自動保存される)、しばらく「元に戻す」を出す (確認ダイアログの代わり)。
  // 戻すときは元の位置に差し込む。保存が済んだ後なら id は無効になっているが、サーバは未知の id を
  // 新しいセクションとして保存するので内容は戻る (期限だけ新しくなる)
  const [deleted, setDeleted] = useState<{ section: EditableSection; index: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelUndo = () => {
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    setDeleted(null);
  };
  useEffect(() => () => clearTimeout(undoTimerRef.current ?? undefined), []);
  const removeSection = (key: string) => {
    const cur = latestRef.current;
    const index = indexOf(key);
    const section = cur[index];
    if (!section) return;
    const next = cur.filter((s) => s.key !== key);
    update(next.length > 0 ? next : [newSection()]);
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    setDeleted({ section, index });
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      setDeleted(null);
    }, UNDO_DELETE_MS);
  };
  const undoDelete = () => {
    if (!deleted) return;
    cancelUndo();
    const cur = latestRef.current;
    // 最後の 1 つを消して空のセクションだけになっていたら、それは置き換える (書き足していなければ)
    const base = cur.length === 1 && cur[0]!.id === null && cur[0]!.content === "" ? [] : cur;
    const i = Math.min(deleted.index, base.length);
    focusLater(deleted.section.key, deleted.section.content.length);
    update([...base.slice(0, i), deleted.section, ...base.slice(i)]);
  };

  // 隣のセクションとの結合 / 移動。境界にいるかの判定 (選択なし・IME 変換中でない・先頭 / 末尾 / 表示上の
  // 最初 / 最後の行) は SectionEditor が行い、ここは隣が無ければ何もしない (↑↓ は false を返して通常の動きに任せる)
  const backspaceAtStart = (i: number) => {
    if (i > 0) mergeSections(i - 1, latestRef.current[i]!.key);
  };
  const deleteAtEnd = (i: number) => {
    const cur = latestRef.current;
    if (i < cur.length - 1) mergeSections(i, cur[i]!.key);
  };
  const arrowUpAtFirstLine = (i: number) => {
    const prev = latestRef.current[i - 1];
    if (!prev) return false;
    focus(prev.key, prev.content.length);
    return true;
  };
  const arrowDownAtLastLine = (i: number) => {
    const next = latestRef.current[i + 1];
    if (!next) return false;
    focus(next.key, 0);
    return true;
  };
  // Tab: エディタを Markdown 表示に戻し、描画後にその表示へフォーカスを移す。
  // CodeMirror の blur 通知 (onBlur) は 10ms 遅れて届くので待たない (その間に別の描画 (自動保存の状態表示など) が
  // 入ると上の layout effect が pendingViewFocusRef を消費してしまい、フォーカスが移らない)
  const exitEditing = (key: string) => {
    pendingViewFocusRef.current = key;
    setEditingKey((k) => (k === key ? null : k));
  };

  // マウント時: 最後のセクションの冒頭を画面の上端に出す。カーソルは置かない (全部 Markdown 表示のまま。
  // まず読み返すことが多く、タッチ端末では開くたびにキーボードが出てしまう)。
  // アンマウント時: タイマーを片付け、debounce 待ちの編集があればその場で保存する。
  // 保存中なら完了時のフォローアップ保存 (save 内のタイマー) に任せる。
  // オフラインなら送っても届かない (離脱前に useBlocker で確認済み) ので何もしない
  useEffect(() => {
    revealLast();
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

  const length = boardLength(toDraft(sections));

  // 最後のセクションより下の空き領域 (やセクションの外枠の余白) をクリックしたら末尾にカーソルを置く
  // (画面全体が書ける場所に見えるように)。
  // mousedown を止めて、編集中のエディタがクリックの途中で blur (→ Markdown 表示) しないようにする
  const isBlank = (e: MouseEvent<HTMLDivElement>) =>
    e.target === e.currentTarget || (e.target as HTMLElement).hasAttribute("data-section");
  const focusEnd = (e: MouseEvent<HTMLDivElement>) => {
    if (readOnly || !isBlank(e)) return;
    const last = latestRef.current.at(-1);
    if (last) focus(last.key, last.content.length);
  };
  const keepFocus = (e: MouseEvent<HTMLDivElement>) => {
    if (isBlank(e)) e.preventDefault();
  };

  // セクションを画像にする。編集中 (エディタ) なら先に Markdown 表示へ切り替え、その描画を同期的に済ませてから
  // (flushSync) その要素を撮る。空のセクションには表示要素が無いのでボタン自体を出さない
  const screenshot = (key: string) => {
    flushSync(() => setEditingKey((k) => (k === key ? null : k)));
    const el = viewsRef.current.get(key);
    if (!el) throw new Error("空のセクションは画像にできません");
    return deliverImage(renderSectionImage(el));
  };

  // フォーカスが外れたら Markdown 表示に戻す。ただしウィンドウ自体がフォーカスを失った場合
  // (タブ切り替えなど) は編集中のまま (戻ってきたときにカーソル位置を保つ)。
  // 別のセクションへ移るときは、移った先が先に editingKey になっているので何もしない
  const onBlur = (key: string) => {
    if (!document.hasFocus()) return;
    setEditingKey((k) => (k === key ? null : k));
  };

  return (
    <Stack gap="xs" style={{ flex: 1 }}>
      <Box
        style={{ flex: 1, cursor: readOnly ? undefined : "text" }}
        onClick={focusEnd}
        onMouseDown={keepFocus}
      >
        {sections.map((s, i) => (
          <Box
            key={s.key}
            data-section
            ref={(el) => {
              if (el) boxesRef.current.set(s.key, el);
              else boxesRef.current.delete(s.key);
            }}
            style={{
              // scrollIntoView で冒頭を合わせるとき、固定ヘッダーと本文の余白のぶんだけ下げる (Main の padding-top と同じ)
              scrollMarginTop: "calc(var(--app-shell-header-offset, 0rem) + var(--app-shell-padding))",
              // 最後のセクションは短くても冒頭が画面の上端まで来られるよう、画面 1 つ分の高さを確保する
              // (1 つしか無いときは外枠が flex で画面いっぱいに広がるので不要。文字数表示のぶんは少し余る)
              minHeight:
                i === sections.length - 1 && sections.length > 1
                  ? "calc(100dvh - var(--app-shell-header-offset, 0rem) - var(--app-shell-padding))"
                  : undefined,
            }}
          >
            {/* 区切り: 期限ラベルとコピー / スクショは線の中 (左)、削除は線の外の右端 (誤って押しにくいように離す) */}
            <Group gap="sm" wrap="nowrap" mt={i === 0 ? 0 : "md"} mb="xs">
              <Divider
                labelPosition="left"
                style={{ flex: 1 }}
                label={
                  <Group gap="sm" wrap="nowrap">
                    {s.expiresAt !== null ? (
                      <span>
                        あと {daysUntil(s.expiresAt)} 日で消えます
                        {/* 期限の日付。狭い画面では省く (title 属性だとタッチ / キーボードで見られないので文字で出す) */}
                        <Text span inherit c="dimmed" visibleFrom="sm">
                          {` (${formatDate(s.expiresAt)})`}
                        </Text>
                      </span>
                    ) : (
                      <span>新しいセクション</span>
                    )}
                    {s.content.trim() !== "" && (
                      <SectionActions
                        index={i}
                        onCopy={() => copySectionText(s.content)}
                        onScreenshot={() => screenshot(s.key)}
                      />
                    )}
                  </Group>
                }
              />
              {!readOnly && (
                <Tooltip label="削除" withArrow>
                  <CloseButton
                    size="xs"
                    c="red"
                    aria-label={`セクション ${i + 1} を削除`}
                    // 編集中のエディタを blur させない (blur でレイアウトが動くとクリックが外れる)
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => removeSection(s.key)}
                  />
                </Tooltip>
              )}
            </Group>
            {(readOnly || s.key !== editingKey) && s.content.trim() !== "" ? (
              <MarkdownView
                content={s.content}
                aria-label={`セクション ${i + 1}`}
                onClick={readOnly ? undefined : () => focus(s.key, s.content.length)}
                ref={(el) => {
                  if (el) viewsRef.current.set(s.key, el);
                  else viewsRef.current.delete(s.key);
                }}
              />
            ) : (
              <SectionEditor
                aria-label={`セクション ${i + 1}`}
                placeholder={
                  sections.length === 1
                    ? [
                        "ここに書く…",
                        `セクションごとに ${MEMO_TTL_DAYS} 日で消えます`,
                        "空行 2 つで次のセクションへ",
                        "Markdown が使えます (# 見出し、- 箇条書き)",
                      ].join("\n")
                    : undefined
                }
                value={s.content}
                onChange={(value, cursor) => changeSection(s.key, value, cursor)}
                onFocus={() => setEditingKey(s.key)}
                onBlur={() => onBlur(s.key)}
                onBackspaceAtStart={() => backspaceAtStart(i)}
                onDeleteAtEnd={() => deleteAtEnd(i)}
                onArrowUpAtFirstLine={() => arrowUpAtFirstLine(i)}
                onArrowDownAtLastLine={() => arrowDownAtLastLine(i)}
                onTab={() => exitEditing(s.key)}
                readOnly={readOnly}
                ref={(editor) => {
                  if (editor) elementsRef.current.set(s.key, editor);
                  else elementsRef.current.delete(s.key);
                }}
              />
            )}
          </Box>
        ))}
      </Box>

      {/* 文字数は打つたびに変わるので等幅の数字にして幅がぶれないようにする */}
      <Text
        size="xs"
        c={length >= BOARD_MAX_LENGTH ? "red" : "dimmed"}
        ta="right"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {length.toLocaleString()} / {BOARD_MAX_LENGTH.toLocaleString()}
      </Text>

      {/* 削除の取り消し (左下。右下は PwaUpdateBanner) */}
      {deleted && (
        <Affix
          position={{
            bottom: "calc(16px + env(safe-area-inset-bottom))",
            left: "calc(16px + env(safe-area-inset-left))",
          }}
        >
          <Notification
            title="セクションを削除しました"
            withBorder
            onClose={cancelUndo}
            closeButtonProps={{ "aria-label": "閉じる" }}
          >
            <Button size="xs" mt="xs" variant="default" onClick={undoDelete}>
              元に戻す
            </Button>
          </Notification>
        </Affix>
      )}
    </Stack>
  );
}
