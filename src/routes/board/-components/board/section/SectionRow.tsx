import type { TagIcon } from "@shared/constants";
import { memo, type RefObject, useRef, useState } from "react";

import type { EditableSection } from "../../../-lib/data/board";
import type { Tag } from "../../../-lib/data/tags";
import { copySectionText } from "../../../-lib/section-export";
import { LifeLabel } from "./LifeLabel";
import { MarkdownView } from "./MarkdownView";
import {
  SectionActions,
  SectionDeleteButton,
  SectionTagButton,
  SectionTagLabel,
} from "./SectionActions";
import { type EditAnchor, SectionEditor, type SectionEditorHandle } from "./SectionEditor";
import { SectionTags } from "./SectionTags";
import { SectionToolbar } from "./SectionToolbar";

import classes from "./SectionRow.module.css";

/**
 * セクションへの操作 (Board が持つ)。どれも対象のセクションの key を受け取る。
 * エディタの境界 (先頭 / 末尾 / 最初 / 最後の行) の判定は SectionEditor が行い、ここは何をするかだけ
 */
export type SectionHandlers = {
  /** 入力 (空行をいくつ続けても、同じセクションの中の空行) */
  change(key: string, value: string): void;
  /** エディタにフォーカスが入った */
  startEditing(key: string): void;
  /** エディタからフォーカスが外れた */
  blur(key: string, anchor: EditAnchor | null): void;
  /** Esc で編集をやめた */
  exitEditing(key: string): void;
  /** 先頭で Backspace (前と結合) / 末尾で Delete (次と結合) */
  backspaceAtStart(key: string): void;
  deleteAtEnd(key: string): void;
  /** 最初 / 最後の行で ↑↓ (隣へ移る)。移る先が無ければ false */
  arrowUpAtFirstLine(key: string): boolean;
  arrowDownAtLastLine(key: string): boolean;
  /** Markdown 表示のクリック / Enter で、その位置の編集へ */
  edit(key: string, pos: number): void;
  /** Markdown 表示にフォーカスがあるときの ↑↓ (隣の表示へ)。移る先が無ければ false */
  navigateView(key: string, dir: -1 | 1): boolean;
  /** 画像にして届ける (クリップボードかダウンロードか) */
  screenshot(key: string): Promise<"clipboard" | "download">;
  /** 削除。viaKeyboard はキーボード (や支援技術) で押した (click の detail が 0) */
  remove(key: string, viaKeyboard: boolean): void;
  /** このセクションに書ける文字数 (エディタが入力のたびに聞く) */
  maxLength(key: string): number;
  /** タグ (の id) を付ける (null は外す) */
  setTag(key: string, tagId: string | null): void;
  /**
   * 登録済みのタグをサーバから取り直す (別の端末での登録・削除を反映する)。結果は取り直した一覧。
   * 一覧そのものは BoardTagsContext から読む (props にすると、登録のたびに全セクションを描き直す)
   */
  reloadTags(): Promise<Tag[]>;
  /**
   * タグを登録する / 名前を変える / 登録を消す (消したタグはセクションからも外れる)。結果は変えた後の一覧。
   * 失敗したら、画面に出せる文言の Error
   */
  registerTag(name: string): Promise<Tag[]>;
  renameTag(tag: Tag, newName: string): Promise<Tag[]>;
  unregisterTag(id: string): Promise<Tag[]>;
};

/** key → 要素の控え (useSectionFocus)。描画した要素をここに登録する */
export type SectionRefs = {
  boxes: RefObject<Map<string, HTMLDivElement>>;
  views: RefObject<Map<string, HTMLDivElement>>;
  editors: RefObject<Map<string, SectionEditorHandle>>;
};

/** Map の ref に key で登録 / 解除する ref コールバック */
function register<T>(map: RefObject<Map<string, T>>, key: string) {
  return (el: T | null) => {
    if (el) map.current.set(key, el);
    else map.current.delete(key);
  };
}

/**
 * 板の 1 セクション: 上の行 (残り日数 + タグ / コピー / スクショ / 削除) と、本文。タグを選ぶ欄は上の行の下に開く。
 * 本文は編集中ならエディタ (SectionEditor)、それ以外は Markdown 表示 (空のセクションは常にエディタ)。
 * memo して、props が変わったセクションだけ描き直す (issue #114): 板は 1 文字の入力ごとに全体を描き直すので、
 * そのたびに全セクションを描き直すと、セクションが多いときに入力が重くなる。
 * そのため props は、そのセクションの内容や状態が変わらない限り同じ値のままにする: handlers / refs は
 * 同一性の変わらないオブジェクト (Board の useStableHandlers / useMemo)、文字数上限は値でなく
 * handlers.maxLength (他のセクションへの入力のたびに変わる値を渡すと、全セクションの memo が外れる)
 */
export const SectionRow = memo(function SectionRow({
  section: s,
  index: i,
  editing,
  readOnly,
  placeholder,
  tagName,
  tagIcon,
  handlers: h,
  refs,
}: {
  section: EditableSection;
  /** 画面に出ている中で何番目か (0 始まり。読み上げの名前「セクション N」に使う) */
  index: number;
  editing: boolean;
  readOnly: boolean;
  /** エディタのプレースホルダ (セクションが 1 つだけのとき) */
  placeholder: string | undefined;
  /**
   * 付いているタグの名前とアイコン。付いていないか、登録に無い id (別の場所で登録を消された) なら undefined
   * (タグなしとして見せる)。memo を保つよう、タグのオブジェクトではなく値で受け取る
   */
  tagName: string | undefined;
  tagIcon: TagIcon | undefined;
  handlers: SectionHandlers;
  refs: SectionRefs;
}) {
  const label = `セクション ${i + 1}`;
  const empty = s.content.trim() === "";
  // タグを選ぶポップオーバーを開いているか。開くのはカードの上の行のタグのボタンで、閉じたらフォーカスをそこへ戻せるよう控えておく
  const [pickingTag, setPickingTag] = useState(false);
  const tagButtonRef = useRef<HTMLButtonElement>(null);
  // 空のセクションは保存されないので、タグも付けられない (付けても残らない)
  const canTag = !readOnly && !empty;
  // Markdown 表示を出しているか (編集中と空のセクションはエディタ)
  const showView = (readOnly || !editing) && !empty;
  return (
    <div data-section ref={register(refs.boxes, s.key)} className={classes.section}>
      {/* カード: 上の行 (残り日数と操作) と本文をひとまとまりの面に載せる。
          外側 (data-section) はスクロールの位置合わせを受け持つ */}
      <div
        className={editing && !readOnly ? `${classes.card} ${classes.editingCard}` : classes.card}
      >
        {/* 上の行: 左に残り日数、右端にタグ / コピー / スクショ / 削除 */}
        <div className={classes.topRow}>
          <LifeLabel expiresAt={s.expiresAt} />
          <span className={classes.spacer} />
          {/* 閲覧のみでも、付いているタグは見せる (押せない札)。空のセクションには出さない */}
          {readOnly && !empty && tagName !== undefined && (
            <SectionTagLabel tag={tagName} icon={tagIcon} />
          )}
          {canTag && (
            <SectionTagButton
              subject={label}
              tag={tagName ?? null}
              icon={tagIcon}
              expanded={pickingTag}
              onClick={() => {
                if (!pickingTag) {
                  setPickingTag(true);
                  return;
                }
                // 閉じるときは、先にフォーカスをこのボタンへ (ボタンは押してもフォーカスを取らないので、ポップオーバーの中に
                // あったフォーカスがポップオーバーと一緒に消え、body に落ちる)。開閉を切り替える (!open) にしないのは、
                // フォーカスを移したときにポップオーバーが「外へ出た」として先に閉じ、切り替えでまた開くため
                tagButtonRef.current?.focus();
                setPickingTag(false);
              }}
              ref={tagButtonRef}
            />
          )}
          {!empty && (
            <SectionActions
              subject={label}
              onCopy={() => copySectionText(s.content)}
              onScreenshot={() => h.screenshot(s.key)}
            />
          )}
          {!readOnly && (
            <SectionDeleteButton
              subject={label}
              onDelete={(viaKeyboard) => h.remove(s.key, viaKeyboard)}
            />
          )}
          {/* タグを選ぶポップオーバー。上の行の右端の下に浮かせる (位置の基準は上の行) */}
          {pickingTag && canTag && (
            <SectionTags
              subject={label}
              tagId={s.tagId}
              handlers={h}
              onSelect={(tag) => h.setTag(s.key, tag)}
              onClose={(refocus) => {
                setPickingTag(false);
                if (refocus) tagButtonRef.current?.focus();
              }}
            />
          )}
        </div>
        {showView ? (
          <MarkdownView
            content={s.content}
            aria-label={label}
            onEdit={readOnly ? undefined : (pos) => h.edit(s.key, pos)}
            onNavigate={readOnly ? undefined : (dir) => h.navigateView(s.key, dir)}
            ref={register(refs.views, s.key)}
          />
        ) : (
          <SectionEditor
            aria-label={label}
            // Tab がインデントに使われて外へ出ないので、抜け方 (Esc) を読み上げでも案内する。
            // 名前に入れるとフォーカスのたびに読まれるので説明 (aria-describedby) にする (#127)
            description="Esc で編集をやめる"
            placeholder={placeholder}
            value={s.content}
            onChange={(value) => h.change(s.key, value)}
            onFocus={() => h.startEditing(s.key)}
            onBlur={(anchor) => h.blur(s.key, anchor)}
            onBackspaceAtStart={() => h.backspaceAtStart(s.key)}
            onDeleteAtEnd={() => h.deleteAtEnd(s.key)}
            onArrowUpAtFirstLine={() => h.arrowUpAtFirstLine(s.key)}
            onArrowDownAtLastLine={() => h.arrowDownAtLastLine(s.key)}
            onEscape={() => h.exitEditing(s.key)}
            getMaxLength={() => h.maxLength(s.key)}
            readOnly={readOnly}
            ref={register(refs.editors, s.key)}
          />
        )}
        {/* 編集中だけ、本文の下に書式のツールバーを出す */}
        {editing && !readOnly && (
          <SectionToolbar
            subject={label}
            run={(command) => refs.editors.current.get(s.key)?.run(command)}
          />
        )}
      </div>
    </div>
  );
});
