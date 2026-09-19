import { Box, CloseButton, Divider, Group, Paper, Tooltip } from "@mantine/core";
import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { newKey, splitAtSeparator } from "@/lib/board";
import { copySectionText, deliverImage, renderSectionImage } from "@/lib/section-export";
import { MarkdownView } from "@/components/MarkdownView";
import { SectionActions } from "@/components/SectionActions";
import {
  SectionEditor,
  type SectionEditorHandle,
} from "@/components/SectionEditor";

// 板の代わりにローカル state だけで持つデモ用セクション
type DemoSection = { key: string; content: string };

// セクションで区切って使う様子を見せる 2 セクション (本物の板は下に書き足していく)
const initialSections = (): DemoSection[] => [
  {
    key: newKey(),
    content: [
      "# ここで試し書き",
      "",
      "自由に書き換えてみてください。",
      "",
      "- 「消える」からこそ気軽に書ける",
      "- 空行 2 つで新しいセクション",
      "    - Tab で 1 段下げる",
    ].join("\n"),
  },
  {
    key: newKey(),
    content: ["今日のやること", "", "- 返信を 2 件", "- 会議室の予約"].join("\n"),
  },
];

/**
 * ランディングのヒーロー直下に置く、ログイン不要で書き味を試せるミニデモ。
 * Board の縮小版で、見た目と操作は本物に合わせる: 非編集時は Markdown 表示 (クリックで編集)、
 * 区切り線にコピー・スクショ・削除。空行 2 つでの分割・境界での結合・
 * ↑↓ でのセクション間移動も同じ。保存はどこにもしない (リロードで消えるのは仕様)。
 * 本物との差分: 保存 / 「元に戻す」は無し
 */
export function LandingDemo() {
  const [sections, setSections] = useState<DemoSection[]>(initialSections);
  // 編集中 (エディタで表示する) セクション。それ以外は Markdown 表示 (Board と同じ)
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // コールバック (エディタの keymap から呼ばれる) は最新の並びを見る
  const latestRef = useRef(sections);
  latestRef.current = sections;
  const elementsRef = useRef(new Map<string, SectionEditorHandle>());
  const viewsRef = useRef(new Map<string, HTMLDivElement>());
  // 描画後にカーソルを置く (エディタがまだ無いセクションを編集状態にしてから)
  const pendingFocusRef = useRef<{ key: string; pos: number } | null>(null);
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
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const editor = elementsRef.current.get(pending.key);
    if (!editor) return;
    pendingFocusRef.current = null;
    editor.focus(pending.pos);
  });

  const changeSection = (key: string, value: string, cursor: number) => {
    const cur = latestRef.current;
    const i = cur.findIndex((s) => s.key === key);
    const orig = cur[i];
    if (!orig) return;
    const split = splitAtSeparator(value, cursor);
    if (!split) {
      setSections(cur.map((s) => (s.key === key ? { ...s, content: value } : s)));
      return;
    }
    const parts = split.parts.map((content, j): DemoSection => ({
      key: j === split.focus.index ? orig.key : newKey(),
      content,
    }));
    focusLater(orig.key, split.focus.offset);
    setSections([...cur.slice(0, i), ...parts, ...cur.slice(i + 1)]);
  };

  // i 番目と i+1 番目をつなげる。フォーカスのある方 (focused) が key を保つ
  const mergeSections = (i: number, focused: string) => {
    const cur = latestRef.current;
    const a = cur[i];
    const b = cur[i + 1];
    if (!a || !b) return;
    focusLater(focused, a.content.length);
    setSections([
      ...cur.slice(0, i),
      { key: focused, content: a.content + b.content },
      ...cur.slice(i + 2),
    ]);
  };

  // ↑↓ で隣のセクションへ (Board と同じ)
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

  // フォーカスしたセクション表示 (MarkdownView) からの ↑↓: 隣の表示へ移る (空は飛ばす)
  const focusViewFrom = (i: number, dir: -1 | 1) => {
    const cur = latestRef.current;
    for (let j = i + dir; j >= 0 && j < cur.length; j += dir) {
      const s = cur[j]!;
      if (s.content.trim() === "") continue;
      viewsRef.current.get(s.key)?.focus({ preventScroll: true });
      return true;
    }
    return false;
  };

  // フォーカスが外れたら Markdown 表示に戻す (Board と同じ。ウィンドウ自体の喪失では戻さない)
  const onEditorBlur = (key: string) => {
    if (!document.hasFocus()) return;
    setEditingKey((k) => (k === key ? null : k));
  };

  // 削除は即時 (デモなので「元に戻す」は無し)。最後の 1 つを消したら空のセクションに置き換える
  const removeSection = (key: string) => {
    const cur = latestRef.current;
    const next = cur.filter((s) => s.key !== key);
    setSections(next.length > 0 ? next : [{ key: newKey(), content: "" }]);
  };

  // 画像化は Markdown 表示の要素から (編集中ならまず表示に戻す。Board と同じ)
  const screenshot = (key: string) => {
    flushSync(() => setEditingKey((k) => (k === key ? null : k)));
    const el = viewsRef.current.get(key);
    if (!el) throw new Error("空のセクションは画像にできません");
    return deliverImage(renderSectionImage(el));
  };

  return (
    <Paper
      withBorder
      shadow="sm"
      radius="md"
      p="md"
      style={{ maxWidth: 860, width: "100%" }}
    >
      {sections.map((s, i) => (
        <Box
          key={s.key}
          // SectionEditor のカーソル追従スクロールは [data-section] の scroll-margin を見る
          // (固定ヘッダーに隠れないように。Board と同じ)
          data-section
          style={{
            scrollMarginTop:
              "calc(var(--app-shell-header-offset, 0rem) + var(--app-shell-padding))",
          }}
        >
          {/* 区切り: Board と同じ並び (コピー・スクショは線の中、削除は線の外の右端) */}
          <Group gap="sm" wrap="nowrap" mt={i === 0 ? 0 : "md"} mb="xs">
            <Divider
              labelPosition="left"
              style={{ flex: 1 }}
              label={
                s.content.trim() === "" ? undefined : (
                  <Group gap="sm" wrap="nowrap">
                    <SectionActions
                      subject={`セクション ${i + 1}`}
                      onCopy={() => copySectionText(s.content)}
                      onScreenshot={() => screenshot(s.key)}
                    />
                  </Group>
                )
              }
            />
            <Tooltip label="削除" withArrow>
              <CloseButton
                size="xs"
                c="red"
                aria-label={`お試しセクション ${i + 1} を削除`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => removeSection(s.key)}
              />
            </Tooltip>
          </Group>
          {s.key !== editingKey && s.content.trim() !== "" ? (
            <MarkdownView
              content={s.content}
              aria-label={`お試しセクション ${i + 1}`}
              onEdit={(pos) => focus(s.key, pos)}
              onNavigate={(dir) => focusViewFrom(i, dir)}
              ref={(el) => {
                if (el) viewsRef.current.set(s.key, el);
                else viewsRef.current.delete(s.key);
              }}
            />
          ) : (
            <SectionEditor
              aria-label={`お試しセクション ${i + 1} (Esc で編集をやめる)`}
              value={s.content}
              onChange={(value, cursor) => changeSection(s.key, value, cursor)}
              onFocus={() => setEditingKey(s.key)}
              onBlur={() => onEditorBlur(s.key)}
              onBackspaceAtStart={() => mergeSections(i - 1, s.key)}
              onDeleteAtEnd={() => mergeSections(i, s.key)}
              onArrowUpAtFirstLine={() => arrowUpAtFirstLine(i)}
              onArrowDownAtLastLine={() => arrowDownAtLastLine(i)}
              onEscape={() => setEditingKey(null)}
              ref={(editor) => {
                if (editor) elementsRef.current.set(s.key, editor);
                else elementsRef.current.delete(s.key);
              }}
            />
          )}
        </Box>
      ))}
    </Paper>
  );
}
