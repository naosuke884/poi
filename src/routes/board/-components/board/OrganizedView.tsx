import { Box, Divider, Group, Text } from "@mantine/core";
import { useLayoutEffect, useMemo, useRef } from "react";

import type { EditableSection } from "../../-lib/data/board";
import { copySectionText, deliverImage, renderSectionImage } from "../../-lib/section-export";
import {
  locateInSection,
  type OrganizedGroup,
  organizeSections,
} from "../../-lib/sections/organized";
import type { DeleteFocus } from "../../-lib/sections/use-undoable-delete";
import { MarkdownView } from "./section/MarkdownView";
import { SectionActions, SectionDeleteButton } from "./section/SectionActions";

/**
 * 見出しごとにまとめた表示 (#37)。タイムライン (通常の板) と切り替えて使う閲覧用のビュー。
 * - 同じ見出しのチャンクを 1 つの Markdown に連結して表示する (まとめ方は src/routes/board/-lib/sections/organized.ts)。
 *   連結で入れた空行は余白にしない (sourceBlankLines={false})。同じ見出しの箇条書きは連結で 1 つのリスト
 *   (項目が段落の loose list) になるが、段落の上下の余白は MarkdownView が消すので詰まったリストに見える
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
  /** このまとめに含めた内容を元セクションから取り除く (フォーカスの扱いは DeleteFocus) */
  onDelete: (group: OrganizedGroup, focus: DeleteFocus) => void;
}) {
  const groups = useMemo(() => organizeSections(sections), [sections]);
  // グループ key → Markdown 表示の要素 (スクショの対象)
  const viewsRef = useRef(new Map<string, HTMLDivElement>());
  const screenshot = (key: string) => {
    const el = viewsRef.current.get(key);
    if (!el) throw new Error("まとめの表示が見つからないため画像にできません");
    return deliverImage(renderSectionImage(el));
  };
  // 描画後にフォーカスを移すまとめの位置 (削除した場所。#112)。後ろが無ければ前のまとめへ
  const pendingFocusRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const index = pendingFocusRef.current;
    if (index === null) return;
    pendingFocusRef.current = null;
    const g = groups[Math.min(index, groups.length - 1)];
    if (g) viewsRef.current.get(g.key)?.focus();
  });
  // 削除ボタン。フォーカスがそのまとめの中にあった (削除ボタンを押した) ときだけ前後のまとめへ移す
  // (そのままだと body に落ちる)。キーボードで押したときは Board が先に「元に戻す」へ移す
  const boxesRef = useRef(new Map<string, HTMLDivElement>());
  const remove = (g: OrganizedGroup, index: number, viaKeyboard: boolean) => {
    const hadFocus = boxesRef.current.get(g.key)?.contains(document.activeElement) ?? false;
    onDelete(g, {
      viaKeyboard,
      returnFocus:
        hadFocus || viaKeyboard
          ? () => {
              pendingFocusRef.current = index;
            }
          : null,
    });
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
          <Box
            key={g.key}
            ref={(el) => {
              if (el) boxesRef.current.set(g.key, el);
              else boxesRef.current.delete(g.key);
            }}
          >
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
                /* タイムラインのセクション削除と同じボタン。押した後は Board の「元に戻す」通知に任せる */
                <SectionDeleteButton
                  subject={subject}
                  onDelete={(viaKeyboard) => remove(g, i, viaKeyboard)}
                />
              )}
            </Group>
            <MarkdownView
              content={g.content}
              sourceBlankLines={false}
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
        );
      })}
    </Box>
  );
}
