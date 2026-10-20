import { Box, Text } from "@mantine/core";
import { MEMO_TTL_DAYS } from "@shared/constants";

import { LifeLineDemo } from "./LifeLineDemo";

import classes from "./Landing.module.css";

/**
 * ヒーローに置く 1 つのメモの見本。開いてすぐ「あと 30 日」から減り、残り 1 日でオレンジになって消える
 * (動きは Landing.module.css の .heroMemo*)。最初の画面で、見出しの「消える」を実際に見せる (HAY-53)。
 * 見出しと説明の繰り返しなので、読み上げからは外す
 */
export function HeroMemo() {
  return (
    <Box aria-hidden className={classes.heroMemo} maw={360} w="100%">
      <div className={classes.heroMemoContent}>
        <LifeLineDemo from={MEMO_TTL_DAYS} to={1} />
        <div className={classes.mockHeading}>思いついたこと</div>
        {/* 板の本文と同じ大きさと行送り */}
        <Text component="ul" fz="md" lh={1.7} className={classes.heroMemoList}>
          <li>駅前のパン屋が気になる</li>
          <li>週末に洗車</li>
        </Text>
      </div>
      <span className={classes.heroMemoGone}>このメモは消えました</span>
    </Box>
  );
}
