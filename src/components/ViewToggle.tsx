import { Center, SegmentedControl, Tooltip, VisuallyHidden } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { ReactNode } from "react";
import { Svg } from "@/components/TablerIcon";
import { type BoardViewMode, setViewMode, useViewMode } from "@/lib/view-mode";

/**
 * ヘッダーの表示切替 (タイムライン / 見出しごとのまとめ #37)。
 * 板を表示している間 (Board が publishViewToggle している間) だけ出す。
 * まとめは閲覧にも役立つので、オフラインの閲覧のみ (readOnly) でも出す (AddSectionButton とは別のストア)
 */
export function ViewToggle() {
  const { active, mode } = useViewMode();
  // ホバーの無い端末 (スマホ) では、タップで出たツールチップが残って邪魔なだけなので出さない
  const noHover = useMediaQuery("(hover: none)");
  if (!active) return null;
  const item = (tooltip: string, label: string, icon: ReactNode) => (
    <Tooltip label={tooltip} withArrow disabled={noHover}>
      <Center h="100%">
        {icon}
        <VisuallyHidden>{label}</VisuallyHidden>
      </Center>
    </Tooltip>
  );
  return (
    <SegmentedControl
      size="xs"
      aria-label="板の表示方法"
      value={mode}
      onChange={(value) => setViewMode(value as BoardViewMode)}
      // 編集中のエディタを blur させない (blur でレイアウトが動くとクリックが外れる。ヘッダーの他のボタンと同じ)
      onMouseDown={(e) => e.preventDefault()}
      data={[
        {
          value: "timeline",
          label: item("タイムライン", "タイムライン (書いた順の表示)", <TimelineIcon />),
        },
        {
          value: "organized",
          label: item("見出しごとにまとめる", "まとめ (見出しごとにまとめた表示)", <OrganizedIcon />),
        },
      ]}
    />
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
