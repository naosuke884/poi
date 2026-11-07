import { type ReactNode, useId } from "react";

import { Tooltip } from "@/components/Tooltip";
import { VisuallyHidden } from "@/components/VisuallyHidden";
import { useMediaQuery } from "@/lib/use-media-query";

import { keepEditorFocus } from "../../../-lib/keep-editor-focus";
import type { BoardViewMode } from "../../../-lib/view-mode";
import { Svg } from "../TablerIcon";

import classes from "./ViewToggle.module.css";

/**
 * ヘッダーの表示切替 (タイムライン / 見出しごとのまとめ #37)。
 * Board が HeaderSlot に出す (板を表示している間だけ)。
 * まとめは閲覧にも役立つので、オフラインの閲覧のみ (readOnly) でも出す。
 *
 * ラジオボタン (input type="radio") を見えなくしてラベルを並べる: ←→ で選択が移る (と同時に切り替わる) のと
 * 「2 つのうち 1 つを選ぶ」読み上げは、ブラウザのラジオのまま使う。選んでいる方には白い札 (indicator) を敷く
 */
export function ViewToggle({
  mode,
  onChange,
}: {
  mode: BoardViewMode;
  onChange: (mode: BoardViewMode) => void;
}) {
  // ホバーの無い端末 (スマホ) では、タップで出たツールチップが残って邪魔なだけなので出さない
  const noHover = useMediaQuery("(hover: none)");
  const name = useId();
  const item = (value: BoardViewMode, tooltip: string, label: string, icon: ReactNode) => (
    // ツールチップはラジオ (input) とラベルを包む枠に付ける: キーボードのフォーカスは見えない input に来るので、
    // ラベルの中身に付けるとフォーカスで出せない。枠はアイコンより上下に 2px (ラベルの余白) 大きいので、
    // アイコンからの距離が矢印ありの既定 (7px) と同じになるよう 5px にする
    <Tooltip label={tooltip} withArrow disabled={noHover} offset={5}>
      <div className={classes.control}>
        <input
          className={classes.input}
          type="radio"
          id={`${name}-${value}`}
          name={name}
          value={value}
          checked={mode === value}
          onChange={() => onChange(value)}
        />
        <label className={classes.label} htmlFor={`${name}-${value}`}>
          <span className={classes.inner}>
            {icon}
            <VisuallyHidden>{label}</VisuallyHidden>
          </span>
        </label>
      </div>
    </Tooltip>
  );
  return (
    // フォーカスを受けるのは中のラジオ。枠の mousedown はエディタのフォーカスを保つためだけ
    // oxlint-disable-next-line jsx-a11y/interactive-supports-focus
    <div
      className={classes.root}
      role="radiogroup"
      aria-label="板の表示方法"
      data-mode={mode}
      onMouseDown={keepEditorFocus}
    >
      <span className={classes.indicator} aria-hidden="true" />
      {item("timeline", "タイムライン", "タイムライン (書いた順の表示)", <TimelineIcon />)}
      {item(
        "organized",
        "見出しごとにまとめる",
        "まとめ (見出しごとにまとめた表示)",
        <OrganizedIcon />,
      )}
    </div>
  );
}

/** タイムライン: 書いた順の行 (align-left) */
function TimelineIcon() {
  return (
    <Svg size={16}>
      <path d="M4 6l16 0" />
      <path d="M4 12l10 0" />
      <path d="M4 18l14 0" />
    </Svg>
  );
}

/** まとめ: 見出しの下に項目がぶら下がる形 (list-tree) */
function OrganizedIcon() {
  return (
    <Svg size={16}>
      <path d="M9 6h11" />
      <path d="M12 12h8" />
      <path d="M15 18h5" />
      <path d="M5 6v.01" />
      <path d="M8 12v.01" />
      <path d="M11 18v.01" />
    </Svg>
  );
}
