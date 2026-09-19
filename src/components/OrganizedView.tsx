import { Box, CloseButton, Divider, Group, Text, Tooltip } from "@mantine/core";
import { useMemo, useRef } from "react";
import type { EditableSection } from "@/lib/board";
import { type OrganizedGroup, locateInSection, organizeSections } from "@/lib/organized";
import { copySectionText, deliverImage, renderSectionImage } from "@/lib/section-export";
import { MarkdownView } from "@/components/MarkdownView";
import { SectionActions } from "@/components/SectionActions";
import classes from "./OrganizedView.module.css";

/**
 * 見出しごとにまとめた表示 (#37)。タイムライン (通常の板) と切り替えて使う閲覧用のビュー。
 * - 同じ見出しのチャンクを 1 つの Markdown に連結して表示する (まとめ方は src/lib/organized.ts)。
 *   同じ見出しの箇条書きは 1 つのリストに見えるよう、連結でできた項目間の余白は詰める (CSS)
 * - 区切り線はタイムラインと同じ見た目で、右にコピー / スクショ。
 *   期限は出さない (チャンクごとに違うのでまとめでは意味が薄い。タイムラインで見られる)
 * - このビュー自体は編集できないが、クリックした場所に対応する元セクションの位置を onJump に渡す
 *   (Board がタイムラインへ切り替えてそこで編集を開く)。readOnly ならそれもしない
 * - 区切り線の右端の × でまとめごと削除できる (Board がグループの範囲を元セクションから取り除く)。
 *   readOnly なら出さない
 */
export function OrganizedView({
  sections,
  readOnly,
  onJump,
  onDelete,
}: {
  sections: EditableSection[];
  readOnly: boolean;
  /** まとめの中のクリック位置に対応する、元セクションの位置で編集を開く */
  onJump: (sectionKey: string, pos: number) => void;
  /** このまとめに含めた内容を元セクションから取り除く */
  onDelete: (group: OrganizedGroup) => void;
}) {
  const groups = useMemo(() => organizeSections(sections), [sections]);
  // グループ key → Markdown 表示の要素 (スクショの対象)
  const viewsRef = useRef(new Map<string, HTMLDivElement>());
  const screenshot = (key: string) => {
    const el = viewsRef.current.get(key);
    if (!el) throw new Error("まとめが空のため画像にできません");
    return deliverImage(renderSectionImage(el));
  };

  if (groups.length === 0) {
    return (
      <Text c="dimmed" mt="md">
        まだメモがありません。タイムラインで書いたメモが、ここに見出しごとにまとまります。
      </Text>
    );
  }

  return (
    <Box>
      {groups.map((g, i) => {
        const subject = g.heading !== null ? `「${g.heading}」のまとめ` : "見出しなしのまとめ";
        const label = [
          ...(g.heading === null ? ["見出しなし"] : []),
          ...(g.chunkCount >= 2 ? [`${g.chunkCount} か所`] : []),
        ].join(" · ");
        return (
          <Box key={g.key}>
            {/* タイムラインのセクションの区切り線と同じ並び (コピー / スクショ / 期限は線の外の右端) */}
            <Group gap="md" wrap="nowrap" mt={i === 0 ? 0 : "md"} mb="xs">
              <Divider
                labelPosition="left"
                style={{ flex: 1, minWidth: 0 }}
                label={label === "" ? undefined : label}
              />
              <SectionActions
                subject={subject}
                onCopy={() => copySectionText(g.content)}
                onScreenshot={() => screenshot(g.key)}
              />
              {!readOnly && (
                /* タイムラインのセクション削除と同じ見た目。押した後は Board の「元に戻す」通知に任せる */
                <Tooltip label="削除" withArrow>
                  <CloseButton
                    size="xs"
                    c="red"
                    aria-label={`${subject} を削除`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onDelete(g)}
                  />
                </Tooltip>
              )}
            </Group>
            <Box className={classes.group}>
              <MarkdownView
                content={g.content}
                aria-label={subject}
                onEdit={
                  readOnly
                    ? undefined
                    : (pos) => {
                        const loc = locateInSection(g.ranges, pos);
                        if (loc) onJump(loc.sectionKey, loc.pos);
                      }
                }
                ref={(el) => {
                  if (el) viewsRef.current.set(g.key, el);
                  else viewsRef.current.delete(g.key);
                }}
              />
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
