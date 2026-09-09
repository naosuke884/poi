import { Box, Divider, Group, Paper, Text } from "@mantine/core";
import { useLayoutEffect, useRef, useState } from "react";
import { MEMO_TTL_DAYS } from "../../worker/memo/constants";
import { newKey, splitAtSeparator } from "@/lib/board";
import {
  SectionEditor,
  type SectionEditorHandle,
} from "@/components/SectionEditor";

// 板の代わりにローカル state だけで持つデモ用セクション。期限は日数の数字をそのまま持つ
type DemoSection = { key: string; content: string; daysLeft: number };

// 期限のばらつきを見せる 2 セクション (残り日数が違うと「セクションごとに消える」が伝わる)。
// 下のスクショ画像とは別の文面にする (同じだと 2 回読まされる)
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
    daysLeft: MEMO_TTL_DAYS,
  },
  {
    key: newKey(),
    content: ["今日のやること", "", "- 返信を 2 件", "- 会議室の予約"].join("\n"),
    daysLeft: 7,
  },
];

const noop = () => {};

/**
 * ランディングのヒーロー直下に置く、ログイン不要で書き味を試せるミニデモ。
 * Board の縮小版: 実物の SectionEditor をそのまま使い、空行 2 つでの分割・境界での結合・
 * ↑↓ でのセクション間移動だけ再現する。保存はどこにもしない (リロードで消えるのは仕様)
 */
export function LandingDemo() {
  const [sections, setSections] = useState<DemoSection[]>(initialSections);
  // コールバック (エディタの keymap から呼ばれる) は最新の並びを見る
  const latestRef = useRef(sections);
  latestRef.current = sections;
  const elementsRef = useRef(new Map<string, SectionEditorHandle>());
  // 描画後にカーソルを置く (分割 / 結合でエディタが作り直された後)
  const pendingFocusRef = useRef<{ key: string; pos: number } | null>(null);
  const focusLater = (key: string, pos: number) => {
    pendingFocusRef.current = { key, pos };
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

  // i 番目と i+1 番目をつなげる。前のセクションが期限を保ち、フォーカスのある方 (focused) が key を保つ
  const mergeSections = (i: number, focused: string) => {
    const cur = latestRef.current;
    const a = cur[i];
    const b = cur[i + 1];
    if (!a || !b) return;
    focusLater(focused, a.content.length);
    setSections([
      ...cur.slice(0, i),
      { key: focused, daysLeft: a.daysLeft, content: a.content + b.content },
      ...cur.slice(i + 2),
    ]);
  };

  const focusNeighbor = (i: number, pos: "start" | "end") => {
    const s = latestRef.current[i];
    if (!s) return false;
    elementsRef.current
      .get(s.key)
      ?.focus(pos === "end" ? s.content.length : 0);
    return true;
  };

  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      style={{ maxWidth: 860, width: "100%" }}
    >
      <Text size="xs" c="dimmed" mb="xs">
        そのまま試し書きできます (保存されません)
      </Text>
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
          {/* Board の区切りの簡略版: 線と期限ラベルだけ (操作ボタンは置かない) */}
          <Group gap="sm" wrap="nowrap" mt={i === 0 ? 0 : "md"} mb="xs">
            <Divider style={{ flex: 1 }} />
            <Text span size="xs" c="dimmed" style={{ flexShrink: 0 }}>
              あと {s.daysLeft} 日
            </Text>
          </Group>
          <SectionEditor
            aria-label={`お試しエディタ セクション ${i + 1} (Esc で編集をやめる)`}
            value={s.content}
            onChange={(value, cursor) => changeSection(s.key, value, cursor)}
            onFocus={noop}
            onBlur={noop}
            onBackspaceAtStart={() => mergeSections(i - 1, s.key)}
            onDeleteAtEnd={() => mergeSections(i, s.key)}
            onArrowUpAtFirstLine={() => focusNeighbor(i - 1, "end")}
            onArrowDownAtLastLine={() => focusNeighbor(i + 1, "start")}
            onEscape={noop}
            ref={(editor) => {
              if (editor) elementsRef.current.set(s.key, editor);
              else elementsRef.current.delete(s.key);
            }}
          />
        </Box>
      ))}
    </Paper>
  );
}
