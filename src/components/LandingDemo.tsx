import { Box, CloseButton, Divider, Group, Paper, Text, Tooltip } from "@mantine/core";
import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MEMO_TTL_DAYS } from "../../worker/memo/constants";
import { firstLine, newKey, splitAtSeparator } from "@/lib/board";
import { copySectionText, deliverImage, renderSectionImage } from "@/lib/section-export";
import { MarkdownView } from "@/components/MarkdownView";
import { SectionActions, SectionCollapseToggle } from "@/components/SectionActions";
import {
  SectionEditor,
  type SectionEditorHandle,
} from "@/components/SectionEditor";

// 板の代わりにローカル state だけで持つデモ用セクション。期限は日数の数字をそのまま持つ
type DemoSection = { key: string; content: string; daysLeft: number };

// 期限のばらつきを見せる 2 セクション (残り日数が違うと「セクションごとに消える」が伝わる)。
// 上ほど古い = 残り日数が少ない (本物の板は下に書き足していくため)
const initialSections = (): DemoSection[] => [
  {
    key: newKey(),
    content: [
      "# ここで試し書き",
      "",
      "書いたそばから残り日数が付きます。自由に書き換えてみてください。",
      "",
      "- 「消える」からこそ気軽に書ける",
      "- 空行 2 つで新しいセクション",
      "    - Tab で 1 段下げる",
    ].join("\n"),
    daysLeft: 7,
  },
  {
    key: newKey(),
    content: ["今日のやること", "", "- 返信を 2 件", "- 会議室の予約"].join("\n"),
    daysLeft: MEMO_TTL_DAYS,
  },
];

/**
 * ランディングのヒーロー直下に置く、ログイン不要で書き味を試せるミニデモ。
 * Board の縮小版で、見た目と操作は本物に合わせる: 非編集時は Markdown 表示 (クリックで編集)、
 * 区切り線に折り畳み・コピー・スクショ・期限ラベル・削除。空行 2 つでの分割・境界での結合・
 * ↑↓ でのセクション間移動も同じ。保存はどこにもしない (リロードで消えるのは仕様)。
 * 本物との差分: 保存 / 「元に戻す」/ 折り畳みへの peek は無し
 */
export function LandingDemo() {
  const [sections, setSections] = useState<DemoSection[]>(initialSections);
  // 編集中 (エディタで表示する) セクション。それ以外は Markdown 表示 (Board と同じ)
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  // コールバック (エディタの keymap から呼ばれる) は最新の並びを見る
  const latestRef = useRef(sections);
  latestRef.current = sections;
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  const elementsRef = useRef(new Map<string, SectionEditorHandle>());
  const viewsRef = useRef(new Map<string, HTMLDivElement>());
  // 描画後にカーソルを置く (エディタがまだ無いセクションを編集状態にしてから)
  const pendingFocusRef = useRef<{ key: string; pos: number } | null>(null);
  const focusLater = (key: string, pos: number) => {
    setCollapsed((c) => {
      if (!c.has(key)) return c;
      const next = new Set(c);
      next.delete(key);
      return next;
    });
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
    // 分割で生まれたセクションは即「あと 30 日」: 「書いたら 30 日で消える」をその場で見せる
    const parts = split.parts.map((content, j): DemoSection => ({
      key: j === split.focus.index ? orig.key : newKey(),
      daysLeft: j === 0 ? orig.daysLeft : MEMO_TTL_DAYS,
      content,
    }));
    focusLater(orig.key, split.focus.offset);
    setSections([...cur.slice(0, i), ...parts, ...cur.slice(i + 1)]);
  };

  // i 番目と i+1 番目をつなげる。前のセクションが期限を保ち、フォーカスのある方 (focused) が key を保つ。
  // 折り畳んだ隣とは結合しない (Board と同じ)
  const mergeSections = (i: number, focused: string) => {
    const cur = latestRef.current;
    const a = cur[i];
    const b = cur[i + 1];
    if (!a || !b) return;
    const other = a.key === focused ? b : a;
    if (collapsedRef.current.has(other.key)) return;
    focusLater(focused, a.content.length);
    setSections([
      ...cur.slice(0, i),
      { key: focused, daysLeft: a.daysLeft, content: a.content + b.content },
      ...cur.slice(i + 2),
    ]);
  };

  // ↑↓ は折り畳んだセクションを飛ばして次の開いているセクションへ (Board と同じ)
  const arrowUpAtFirstLine = (i: number) => {
    const prev = latestRef.current
      .slice(0, i)
      .findLast((s) => !collapsedRef.current.has(s.key));
    if (!prev) return false;
    focus(prev.key, prev.content.length);
    return true;
  };
  const arrowDownAtLastLine = (i: number) => {
    const next = latestRef.current
      .slice(i + 1)
      .find((s) => !collapsedRef.current.has(s.key));
    if (!next) return false;
    focus(next.key, 0);
    return true;
  };

  // フォーカスしたセクション表示 (MarkdownView) からの ↑↓: 隣の表示へ移る (空と折り畳みは飛ばす)
  const focusViewFrom = (i: number, dir: -1 | 1) => {
    const cur = latestRef.current;
    for (let j = i + dir; j >= 0 && j < cur.length; j += dir) {
      const s = cur[j]!;
      if (s.content.trim() === "" || collapsedRef.current.has(s.key)) continue;
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

  const toggleCollapsed = (key: string) => {
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setEditingKey((k) => (k === key ? null : k));
  };

  // 削除は即時 (デモなので「元に戻す」は無し)。最後の 1 つを消したら空のセクションに置き換える
  const removeSection = (key: string) => {
    const cur = latestRef.current;
    const next = cur.filter((s) => s.key !== key);
    setSections(
      next.length > 0
        ? next
        : [{ key: newKey(), content: "", daysLeft: MEMO_TTL_DAYS }],
    );
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
          {/* 区切り: Board と同じ並び (折り畳み・コピー・スクショは線の中、期限と削除は線の外の右端) */}
          <Group gap="sm" wrap="nowrap" mt={i === 0 ? 0 : "md"} mb="xs">
            <Divider
              labelPosition="left"
              style={{ flex: 1, minWidth: 0 }}
              styles={{ label: { maxWidth: "100%", minWidth: 0 } }}
              label={
                s.content.trim() === "" ? undefined : (
                  <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                    <SectionCollapseToggle
                      index={i}
                      collapsed={collapsed.has(s.key)}
                      onToggle={() => toggleCollapsed(s.key)}
                    />
                    {!collapsed.has(s.key) && (
                      <SectionActions
                        index={i}
                        onCopy={() => copySectionText(s.content)}
                        onScreenshot={() => screenshot(s.key)}
                      />
                    )}
                    {collapsed.has(s.key) && (
                      /* 折り畳み中: 最初の行を区切り線の中に出す。クリックで開く (Board と同じ) */
                      <Text
                        span
                        inherit
                        c="dimmed"
                        style={{
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          cursor: "pointer",
                        }}
                        onClick={() => toggleCollapsed(s.key)}
                      >
                        {firstLine(s.content)}
                      </Text>
                    )}
                  </Group>
                )
              }
            />
            <Text span size="xs" c="dimmed" style={{ flexShrink: 0 }}>
              あと {s.daysLeft} 日
            </Text>
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
          {collapsed.has(s.key) ? null : s.key !== editingKey &&
            s.content.trim() !== "" ? (
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
