import { redo, undo } from "@codemirror/commands";
import type { Command } from "@codemirror/view";
import type { ReactNode } from "react";

import { Tooltip } from "@/components/Tooltip";

import { toggleHeading, toggleList } from "../../../-lib/editor/format-commands";
import { indentLess, indentMoreOrInsertTab } from "../../../-lib/editor/list-indent";
import { keepEditorFocus } from "../../../-lib/keep-editor-focus";
import { Svg } from "../TablerIcon";

import classes from "./SectionToolbar.module.css";

const HEADING_1 = toggleHeading(1);
const HEADING_2 = toggleHeading(2);
const BULLET_LIST = toggleList("bullet");
const ORDERED_LIST = toggleList("ordered");

/**
 * 編集中のセクションの下に出す、書式のツールバー。見出し・箇条書き・インデントと、元に戻す / やり直す。
 * キーボードなら記号 (# や -) や Tab で書けるが、スマホでは打ちにくいので、押すだけで付け替えられるようにする。
 * どのボタンも mousedown を止めて、エディタからフォーカスを外さない (外れると編集が終わり、キーボードも閉じる)。
 * 編集を終えるボタンは置かない (他の場所を押すか Esc で終わる)
 */
export function SectionToolbar({
  subject,
  run,
}: {
  /** 読み上げ用の対象の名前 (「セクション 3」) */
  subject: string;
  /** エディタにコマンドを実行させる */
  run: (command: Command) => void;
}) {
  const tool = (label: string, command: Command, icon: ReactNode) => (
    <Tooltip label={label} withArrow>
      <button
        type="button"
        className={classes.tool}
        aria-label={label}
        onMouseDown={keepEditorFocus}
        onClick={() => run(command)}
      >
        {icon}
      </button>
    </Tooltip>
  );
  return (
    <div role="toolbar" aria-label={`${subject} の書式`} className={classes.root}>
      {/* 入りきらなければ、横にスクロールする */}
      <div className={classes.tools}>
        {/* H1 / H2 は見えている文字を名前の頭に置く (音声入力でその文字を言えば押せるように。WCAG 2.5.3) */}
        {tool("H1 見出し", HEADING_1, <span className={classes.text}>H1</span>)}
        {tool("H2 見出し", HEADING_2, <span className={classes.text}>H2</span>)}
        <span aria-hidden className={classes.separator} />
        {tool("箇条書き", BULLET_LIST, <ListIcon />)}
        {tool("番号付きリスト", ORDERED_LIST, <ListNumbersIcon />)}
        {tool("インデントを下げる", indentMoreOrInsertTab, <IndentIncreaseIcon />)}
        {tool("インデントを戻す", indentLess, <IndentDecreaseIcon />)}
        <span aria-hidden className={classes.separator} />
        {tool("元に戻す", undo, <UndoIcon />)}
        {tool("やり直す", redo, <RedoIcon />)}
      </div>
    </div>
  );
}

function ListIcon() {
  return (
    <Svg size={18}>
      <path d="M9 6l11 0" />
      <path d="M9 12l11 0" />
      <path d="M9 18l11 0" />
      <path d="M5 6l0 .01" />
      <path d="M5 12l0 .01" />
      <path d="M5 18l0 .01" />
    </Svg>
  );
}

function ListNumbersIcon() {
  return (
    <Svg size={18}>
      <path d="M11 6h9" />
      <path d="M11 12h9" />
      <path d="M12 18h8" />
      <path d="M4 16a2 2 0 1 1 4 0c0 .591 -.5 1 -1 1.5l-3 2.5h4" />
      <path d="M6 10v-6l-2 2" />
    </Svg>
  );
}

function IndentIncreaseIcon() {
  return (
    <Svg size={18}>
      <path d="M20 6l-11 0" />
      <path d="M20 12l-7 0" />
      <path d="M20 18l-11 0" />
      <path d="M4 8l4 4l-4 4" />
    </Svg>
  );
}

function IndentDecreaseIcon() {
  return (
    <Svg size={18}>
      <path d="M20 6l-7 0" />
      <path d="M20 12l-9 0" />
      <path d="M20 18l-7 0" />
      <path d="M8 8l-4 4l4 4" />
    </Svg>
  );
}

function UndoIcon() {
  return (
    <Svg size={18}>
      <path d="M9 14l-4 -4l4 -4" />
      <path d="M5 10h11a4 4 0 1 1 0 8h-1" />
    </Svg>
  );
}

function RedoIcon() {
  return (
    <Svg size={18}>
      <path d="M15 14l4 -4l-4 -4" />
      <path d="M19 10h-11a4 4 0 1 0 0 8h1" />
    </Svg>
  );
}
