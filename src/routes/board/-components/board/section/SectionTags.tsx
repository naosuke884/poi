import { normalizeTag, TAG_MAX_LENGTH } from "@shared/constants";
import {
  type FocusEvent,
  type KeyboardEvent,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/Button";
import { VisuallyHidden } from "@/components/VisuallyHidden";

import type { Tag } from "../../../-lib/data/tags";
import { BoardTagsContext } from "../../../-lib/use-board-tags";
import { CheckIcon, PlusIcon, Svg, XIcon } from "../TablerIcon";
import { TagIconSvg } from "../TagIcon";
import type { SectionHandlers } from "./SectionRow";

import classes from "./SectionTags.module.css";

type TagHandlers = Pick<
  SectionHandlers,
  "reloadTags" | "registerTag" | "renameTag" | "unregisterTag"
>;

/** 一覧の 1 行: 登録済みのタグか、打った名前で新しく作る行 */
type Item = { kind: "tag"; tag: Tag } | { kind: "create"; name: string };

/**
 * タグを選ぶポップオーバー (Notion のデータベースの「セレクト」プロパティと同じ形)。カードの上の行のタグのボタンの下に浮かせる。
 * 開いているかは SectionRow が持ち、開いている間だけ描く (開くたびに作り直すので、入力や選んだ行は残らない)。
 * - 上の欄: 付いているタグ (× で外す) と、タグを探す / 新しく作る入力欄
 * - 下の一覧: 登録済みのタグ (打った文字で絞り込む)。押すとそのタグを付けて閉じる。
 *   打った名前のタグが無ければ、最後に + の行が出る (押すと登録して付ける)
 * - 説明の文は画面に出さない (札・+・チェック・「…」で伝える。文が多いとうるさい)。使い方は読み上げの説明にだけ置く
 * - 入力欄で ↑↓ は一覧の中の行を選び、Enter でその行を実行する (何も打っていなければ何もしない)。
 *   最初の行が選ばれた状態で始まる (打って Enter で、いちばん近いタグか、作成)
 * - 各行の「…」で、その行の中で名前を変えたり (Enter で保存、Esc でやめる)、登録を消したりできる。
 *   名前を変えると付けていたセクションのタグも変わり、登録を消すと付けていたセクションからも外れる (元に戻せないので確かめる)
 * - Esc で閉じる (名前を変えている途中などなら、それをやめる)。外へフォーカスが移っても閉じる
 * - 登録・名前の変更・削除はサーバへ送るので、オフラインではできない (選ぶだけならできる)
 * - 一覧は板の持つもの (BoardTagsContext) をそのまま出す (開いている間に別の操作や取り直しで変わっても、すぐ反映する)
 */
export function SectionTags({
  subject,
  tagId,
  handlers,
  onSelect,
  onClose,
}: {
  /** 読み上げ用の対象の名前 (「セクション 3」) */
  subject: string;
  /** 付いているタグの id (無ければ null) */
  tagId: string | null;
  handlers: TagHandlers;
  /** タグ (の id) を付ける (null は外す) */
  onSelect: (tagId: string | null) => void;
  /** 閉じる。refocus は、フォーカスをタグのボタンへ戻すか (中の操作で閉じたとき) */
  onClose: (refocus: boolean) => void;
}) {
  const tags = useContext(BoardTagsContext);
  const current = tags.find((t) => t.id === tagId);
  const [query, setQuery] = useState("");
  // 入力欄の Enter で実行する行 (一覧の何番目か)
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 「…」で開いている行 (名前の変更と削除) と、そこで打っている名前
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // 登録を消してよいか確かめている
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // 「…」で開いた行の、名前の入力欄
  const renameRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // 閉じたか (登録の返事を待つ間に、外を押して閉じられることがある)
  const closedRef = useRef(false);
  // 開いたらすぐ打てるように入力欄へ。あわせて一覧を取り直す (別の端末で登録・削除されたタグを反映する。
  // 取れなければ手元の一覧のまま)
  useEffect(() => {
    // 開いたときに戻しておく (開発時の StrictMode は effect を片付けてからもう一度動かすので、片付けで立てたままにしない)
    closedRef.current = false;
    inputRef.current?.focus();
    handlers.reloadTags().catch(() => {});
    return () => {
      closedRef.current = true;
    };
    // 開いたときに一度だけ (handlers は同一性の変わらないオブジェクト)
  }, [handlers]);

  // 探すのも登録する形 (先頭の # や余分な空白を落とした形) で。入力欄は TAG_MAX_LENGTH 文字までなので、
  // null になるのは空のときだけ (すべてを出す)
  const newName = normalizeTag(query);
  const needle = newName ?? "";
  // 打った名前と同じもの、打った名前で始まるもの、含むものの順 (Enter で付く最初の行を、いちばん近いタグにする)
  const closeness = (name: string) => (name === needle ? 0 : name.startsWith(needle) ? 1 : 2);
  const matches = tags
    .filter((t) => t.name.includes(needle))
    .toSorted((a, b) => closeness(a.name) - closeness(b.name));
  const items: Item[] = [
    ...matches.map((tag): Item => ({ kind: "tag", tag })),
    // 同じ名前のタグがあれば先頭に並んでいる (closeness)
    ...(newName !== null && matches[0]?.name !== newName
      ? [{ kind: "create" as const, name: newName }]
      : []),
  ];
  const activeIndex = Math.min(active, items.length - 1);
  // ↑↓ で選び直した Enter の行き先 (読み上げ用。選んでいる行は見た目だけで示すので)。打つたびには伝えない
  // (1 文字ごとや変換の途中にも読まれてうるさい。打った直後はいちばん近い行で、それは案内の文で伝えている)
  const [announced, setAnnounced] = useState("");

  /** サーバへの操作を 1 つ実行する。失敗したら文言を出す。成功したら変えた後の一覧を、失敗したら null を返す */
  const run = async (action: () => Promise<Tag[]>): Promise<Tag[] | null> => {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const select = (id: string | null) => {
    onSelect(id);
    // 登録の返事を待つ間に閉じられていたら、タグは付けるがフォーカスは動かさない
    // (利用者はもう別の場所を操作しているので、そこからフォーカスを奪わない)
    if (!closedRef.current) onClose(true);
  };

  const runItem = async (item: Item) => {
    if (busy) return;
    if (item.kind === "tag") {
      select(item.tag.id);
      return;
    }
    // 押した「作成」は処理中に押せなくなるので、先にフォーカスを入力欄へ移しておく
    // (フォーカスのあるボタンが押せなくなると、外へ出たものとして閉じてしまう)
    inputRef.current?.focus();
    const list = await run(() => handlers.registerTag(item.name));
    // 作ったタグ (や、同じ名前で別の場所が先に作っていたタグ) の id は、返ってきた一覧から名前で探す
    const created = list?.find((t) => t.name === item.name);
    if (created) select(created.id);
  };

  /** 「…」で開いた行を閉じる。消える入力欄やボタンにフォーカスを残さないよう、先に入力欄へ移す */
  const leaveEdit = () => {
    inputRef.current?.focus();
    setEditing(null);
    setConfirming(false);
  };

  const startEdit = (tag: Tag) => {
    setError(null);
    setConfirming(false);
    setEditing(tag.id);
    setDraft(tag.name);
  };

  const rename = async (tag: Tag) => {
    const renamed = normalizeTag(draft);
    if (renamed === null || busy) return;
    if (renamed === tag.name) {
      leaveEdit();
      return;
    }
    if (await run(() => handlers.renameTag(tag, renamed))) leaveEdit();
  };

  const unregister = async (id: string) => {
    // 「削除する」は処理中に押せなくなるので、先にフォーカスを入力欄へ移しておく (leaveEdit と同じ理由)
    inputRef.current?.focus();
    if (await run(() => handlers.unregisterTag(id))) leaveEdit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // 日本語入力の変換中の Esc は、変換の取り消しだけにする (閉じたり、名前の変更をやめたりしない)
    if (e.key !== "Escape" || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    // 板の Esc (編集をやめる) などに伝えない
    e.stopPropagation();
    if (editing !== null) leaveEdit();
    else onClose(true);
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 日本語入力の確定の Enter や変換中の ↑↓ は、入力欄に任せる (Safari は確定の後に keyCode 229 の keydown を送る)
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = (activeIndex + step + items.length) % items.length;
      setActive(next);
      const item = items[next]!;
      if (newName !== null) {
        setAnnounced(
          item.kind === "tag" ? `「${item.tag.name}」を付ける` : `「${item.name}」を作って付ける`,
        );
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      // 何も打っていないときは、選ぶつもりが分からないので何もしない (一覧から押してもらう)
      const item = items[activeIndex];
      if (newName !== null && item) void runItem(item);
    } else if (e.key === "Backspace" && query === "" && current) {
      // 空の入力欄で Backspace は、付いているタグを外す (Notion と同じ)
      onSelect(null);
    }
  };

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    // 中での移動と、ウィンドウごとフォーカスを失ったとき (別のタブへ) は閉じない
    if (e.currentTarget.contains(e.relatedTarget) || !document.hasFocus()) return;
    onClose(false);
  };

  return (
    // キーボード操作は中のボタンと入力欄が受ける。ここは Esc と、外へ出たことを拾うだけ
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="group"
      aria-label={`${subject} のタグを選ぶ`}
      className={classes.popover}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      // 中を押してもフォーカスを入力欄から動かさない (入力欄を押したときは除く)。Safari などはボタンを押しても
      // フォーカスを移さず、入力欄からフォーカスが外れたこと (外へ出た扱い) で、押す前にポップオーバーが閉じてしまう
      // 入力欄 (カーソルを置く) と、一覧のスクロールバー (内側の大きさの外を押した) は除く
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (target instanceof HTMLInputElement) return;
        // スクロールバーは、一覧があふれているときに、内側 (clientWidth / clientHeight) の外にある
        const { offsetX, offsetY } = e.nativeEvent;
        const scrollable =
          target.id === listId &&
          (target.scrollHeight > target.clientHeight || target.scrollWidth > target.clientWidth);
        if (scrollable && (offsetX >= target.clientWidth || offsetY >= target.clientHeight)) return;
        e.preventDefault();
      }}
    >
      {/* 付いているタグと、探す / 作る入力欄 (Notion と同じく、同じ枠の中に並べる) */}
      <div className={classes.field}>
        {current && (
          <span className={classes.pill}>
            <TagIconSvg icon={current.icon} size={14} />
            {current.name}
            <button
              type="button"
              className={classes.pillRemove}
              aria-label={`タグ「${current.name}」を外す`}
              onClick={() => {
                onSelect(null);
                inputRef.current?.focus();
              }}
            >
              <XIcon size={12} />
            </button>
          </span>
        )}
        <input
          ref={inputRef}
          className={classes.search}
          type="text"
          value={query}
          maxLength={TAG_MAX_LENGTH}
          placeholder="タグ…"
          aria-label="タグを探すか、新しく作る"
          aria-describedby={`${listId}-hint`}
          aria-controls={listId}
          autoComplete="off"
          autoCapitalize="off"
          enterKeyHint="done"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setAnnounced("");
          }}
          onKeyDown={onInputKeyDown}
        />
      </div>
      <span id={`${listId}-hint`} hidden>
        名前を打つと、いちばん近いタグが選ばれる。↑↓ で選び直して Enter
        で付ける。無い名前は最後の作る行で作って付ける
      </span>
      <VisuallyHidden role="status">{announced}</VisuallyHidden>

      <ul id={listId} className={classes.list}>
        {items.map((item, i) => {
          const highlighted = newName !== null && i === activeIndex;
          if (item.kind === "create") {
            return (
              <li key="create" className={classes.row} data-active={highlighted || undefined}>
                <button
                  type="button"
                  className={classes.option}
                  disabled={busy}
                  onClick={() => void runItem(item)}
                >
                  {/* 「作成」の文字は出さず、+ と札で見せる (読み上げには名前で伝える) */}
                  <PlusIcon size={14} />
                  <span className={classes.pill}>{item.name}</span>
                  <VisuallyHidden>を作る</VisuallyHidden>
                </button>
              </li>
            );
          }
          const { tag } = item;
          const { name } = tag;
          if (editing === tag.id) {
            return (
              <li key={tag.id} className={`${classes.row} ${classes.editRow}`}>
                <input
                  ref={renameRef}
                  className={classes.rename}
                  // 「…」を押したら、そのまま打てるように
                  // oxlint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  type="text"
                  value={draft}
                  maxLength={TAG_MAX_LENGTH}
                  aria-label={`タグ「${name}」の新しい名前`}
                  aria-describedby={`${listId}-rename-hint`}
                  autoComplete="off"
                  autoCapitalize="off"
                  enterKeyHint="done"
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
                    e.preventDefault();
                    void rename(tag);
                  }}
                />
                <span id={`${listId}-rename-hint`} hidden>
                  Enter で名前を変える、Esc でやめる
                </span>
                {confirming ? (
                  <span className={classes.confirm}>
                    <Button
                      size="xs"
                      variant="outline-danger"
                      loading={busy}
                      onClick={() => void unregister(tag.id)}
                    >
                      削除する
                    </Button>
                    {/* 確かめる行が出たら、押し間違えても消えない方へフォーカスを移す */}
                    <Button
                      size="xs"
                      variant="default"
                      // oxlint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      onClick={() => {
                        // 押したボタンは消えるので、先にフォーカスを名前の入力欄へ移す (leaveEdit と同じ理由)
                        renameRef.current?.focus();
                        setConfirming(false);
                      }}
                    >
                      キャンセル
                    </Button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className={classes.delete}
                    disabled={busy}
                    onClick={() => setConfirming(true)}
                  >
                    <TrashIcon />
                    削除
                  </button>
                )}
              </li>
            );
          }
          return (
            <li key={tag.id} className={classes.row} data-active={highlighted || undefined}>
              <button
                type="button"
                className={classes.option}
                aria-pressed={tag.id === current?.id}
                onClick={() => void runItem(item)}
              >
                <span className={classes.pill}>
                  <TagIconSvg icon={tag.icon} size={14} />
                  {name}
                </span>
                {tag.id === current?.id && <CheckIcon size={18} />}
              </button>
              <button
                type="button"
                className={classes.more}
                aria-label={`タグ「${name}」の名前を変える・削除する`}
                disabled={busy}
                onClick={() => startEdit(tag)}
              >
                <DotsIcon />
              </button>
            </li>
          );
        })}
      </ul>
      {error !== null && (
        <p role="alert" className={classes.error}>
          {error}
        </p>
      )}
    </div>
  );
}

function DotsIcon() {
  return (
    <Svg size={16}>
      <path d="M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    </Svg>
  );
}

function TrashIcon() {
  return (
    <Svg size={14}>
      <path d="M4 7l16 0" />
      <path d="M10 11l0 6" />
      <path d="M14 11l0 6" />
      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
      <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
    </Svg>
  );
}
