import { Box, Group, Text } from "@mantine/core";
import { DAY_MS } from "@shared/constants";
import type { ReactNode } from "react";

/**
 * セクションの区切り線を兼ねた寿命のバー (issue #95)。
 * 線そのものは全幅の薄い線 (セクションの境界)。その上に、残りの期間の割合だけ濃い線を左から重ねる
 * (書いた直後は全幅、消える直前はほぼ 0)。左端に「あと N 日」。残り 1 日以下はオレンジにして、もうすぐ消えると分かるようにする。
 * 未保存のセクション (期限がまだ無い) は線と「新しいセクション」だけ
 */
export function LifeLine({
  createdAt,
  expiresAt,
  now = Date.now(),
}: {
  createdAt: string | null;
  expiresAt: string | null;
  now?: number;
}) {
  if (createdAt === null || expiresAt === null) {
    return (
      <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
        <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
          新しいセクション
        </Text>
        <Track />
      </Group>
    );
  }
  const end = new Date(expiresAt).getTime();
  const total = end - new Date(createdAt).getTime();
  const left = Math.max(0, end - now);
  // 期限は日単位で付くので切り上げ (残り 5 時間でも「あと 1 日」)
  const days = Math.ceil(left / DAY_MS);
  const ratio = total > 0 ? Math.min(1, left / total) : 0;
  const soon = days <= 1;
  const color = soon ? "var(--mantine-color-orange-filled)" : "var(--mantine-color-dimmed)";
  return (
    <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
      {/* ラベルの幅を揃えて、どのセクションでもバーの始まりを同じ位置にする (長さを比べられるように) */}
      <Text
        size="xs"
        c={soon ? "orange" : "dimmed"}
        style={{ whiteSpace: "nowrap", minWidth: "5.5em", fontVariantNumeric: "tabular-nums" }}
      >
        あと {days} 日
      </Text>
      <Track>
        <Box
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            height: 2,
            transform: "translateY(-50%)",
            width: `${ratio * 100}%`,
            background: color,
            borderRadius: 1,
          }}
        />
      </Track>
    </Group>
  );
}

/** 全幅の薄い線 (Mantine の Divider と同じ色)。子に残りの期間の濃い線を重ねる */
function Track({ children }: { children?: ReactNode }) {
  return (
    <Box
      aria-hidden
      style={{
        position: "relative",
        flex: 1,
        height: 1,
        background: "var(--mantine-color-default-border)",
      }}
    >
      {children}
    </Box>
  );
}
