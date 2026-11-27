import type { TagIcon } from "@shared/constants";
import { type ReactNode, useEffect } from "react";

import { TagIconSvg } from "@/components/TagIcon";

import type { FigureTurn } from "../-lib/use-figure-sequence";
import { useInView } from "../-lib/use-in-view";

import classes from "./FeatureFigures.module.css";

// 特徴ごとの図。板の見た目 (机の上の白いカード、上の行の「あと N 日」、タグの札) を縮めて描き、
// 文字は線に置き換えて (何が書いてあるかではなく、何が起きるかだけを見せる)、
// 何が起きるかを短いアニメーションで見せる。本物の部品 (SectionRow 等) を使わないのは、
// 板の状態 (保存・編集・タグの一覧の文脈) が無いと描けず、ランディングに板の処理を持ち込むことになるため。
// 図は飾りで、言いたいことは各節の見出しが言うので、読み上げからは隠す (aria-hidden)

/**
 * 図の入れ物 (机の色の台は節が敷く)。順番が来て見えている間だけアニメーションを進め (data-playing。
 * それまでは最初の絵で止めておく)、見え方と動き終わったことを順番の係 (useFigureSequence) に知らせる
 */
function FigureFrame({
  turn,
  className,
  children,
}: {
  turn: FigureTurn;
  className: string;
  children: ReactNode;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const { mayPlay, onInViewChange, onDone } = turn;
  useEffect(() => onInViewChange(inView), [inView, onInViewChange]);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof element.getAnimations !== "function") return;
    const finishIfAllDone = () => {
      if (element.getAnimations({ subtree: true }).every((a) => a.playState === "finished"))
        onDone();
    };
    // 動きを減らす設定ではアニメーションが無いので、最初から動き終わっている
    finishIfAllDone();
    element.addEventListener("animationend", finishIfAllDone);
    return () => element.removeEventListener("animationend", finishIfAllDone);
  }, [ref, onDone]);
  return (
    <div ref={ref} aria-hidden="true" className={classes.frame} data-playing={mayPlay || undefined}>
      <div className={className}>{children}</div>
    </div>
  );
}

type MiniCardProps = {
  /** 残り 1 日 (日数の線を橙にする) */
  soon?: boolean;
  tag?: TagIcon;
  actions?: ReactNode;
  className?: string;
  /** 本文 (Line などの線) */
  children: ReactNode;
};

/** 板のセクションのカードを縮めたもの。上の行に残り日数とタグ / 操作、下に本文 (どれも線で描く) */
function MiniCard({ soon = false, tag, actions, className = "", children }: MiniCardProps) {
  return (
    <div className={`${classes.card} ${className}`}>
      <div className={classes.topRow}>
        <span className={soon ? classes.lifeSoon : classes.life} />
        <span className={classes.spacer} />
        {tag && (
          <span className={classes.tagIcon}>
            <TagIconSvg icon={tag} size={14} />
          </span>
        )}
        {actions}
      </div>
      <div className={classes.body}>{children}</div>
    </div>
  );
}

type Width = "w70" | "w55" | "w40";

/** 本文の 1 行の線 */
function Line({ width }: { width: Width }) {
  return <span className={`${classes.line} ${classes[width]}`} />;
}

/** 消える: いちばん古いセクションだけが溶けるように消える */
export function ExpiryFigure({ turn }: { turn: FigureTurn }) {
  return (
    <FigureFrame turn={turn} className={`${classes.stack} ${classes.expiryScene}`}>
      <MiniCard>
        <Line width="w55" />
      </MiniCard>
      <MiniCard>
        <Line width="w70" />
      </MiniCard>
      <MiniCard soon className={classes.expiring}>
        <Line width="w40" />
      </MiniCard>
    </FigureFrame>
  );
}

/** 絞り込み: 仕事のタグの札を選ぶと、仕事のタグのセクションだけが残って詰まる */
export function TagFilterFigure({ turn }: { turn: FigureTurn }) {
  return (
    <FigureFrame turn={turn} className={`${classes.stack} ${classes.tagsScene}`}>
      <div className={classes.filterBar}>
        <span className={`${classes.pill} ${classes.pillAll}`}>
          <span className={classes.pillLine} />
        </span>
        <span className={`${classes.pill} ${classes.pillWork}`}>
          <TagIconSvg icon="work" size={14} />
          <span className={classes.pillLine} />
        </span>
        <span className={classes.pill}>
          <TagIconSvg icon="shopping" size={14} />
          <span className={classes.pillLine} />
        </span>
      </div>
      <MiniCard tag="work">
        <Line width="w55" />
      </MiniCard>
      <MiniCard tag="shopping" className={classes.filteredOut}>
        <Line width="w40" />
      </MiniCard>
      <MiniCard tag="work" className={classes.moveUp}>
        <Line width="w70" />
      </MiniCard>
    </FigureFrame>
  );
}

// パソコンで打ってスマホに届く文の語の数。語を一つずつ出す遅れと語ごとの幅は CSS の nth-child で付けているので、
// 増やすなら CSS も足す
const WORDS = 4;

/** 文を語ごとの線で描く */
function Words({ className }: { className: string }) {
  return (
    <span className={className}>
      {Array.from({ length: WORDS }, (_, i) => (
        <span key={i} className={classes.word} />
      ))}
    </span>
  );
}

/** 端末の画面の中の板: ヘッダーと、机に並んだカード。1 枚目に children (打つ / 届く文) */
function MiniApp({ cardClassName, children }: { cardClassName: string; children: ReactNode }) {
  return (
    <div className={classes.app}>
      <div className={classes.appHeader}>
        <span className={classes.appLogo} />
        <span className={classes.spacer} />
        <span className={classes.appAvatar} />
      </div>
      <div className={classes.appDesk}>
        <MiniCard className={cardClassName}>{children}</MiniCard>
        <MiniCard>
          <Line width="w55" />
        </MiniCard>
        <MiniCard soon>
          <Line width="w40" />
        </MiniCard>
      </div>
    </div>
  );
}

/** パソコンからスマホへの矢印。灰色の点線で描き、その上に同期するときだけ藍の線を引く */
function SyncArrow() {
  const route = "M4 18 C14 4 34 4 44 16";
  return (
    <svg
      className={classes.syncArrow}
      viewBox="0 0 48 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={route} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <path d="M43.5 10L44 16L38.2 14.4" vectorEffect="non-scaling-stroke" />
      <path className={classes.sync} d={route} pathLength={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** どこでも: パソコンで書いたメモが、スマホにも同じように出る */
export function DevicesFigure({ turn }: { turn: FigureTurn }) {
  return (
    <FigureFrame turn={turn} className={classes.devices}>
      <div className={classes.laptop}>
        <div className={classes.laptopLid}>
          <div className={classes.laptopScreen}>
            <MiniApp cardClassName={classes.writingCard}>
              <Words className={classes.typed} />
            </MiniApp>
          </div>
        </div>
        <div className={classes.laptopBase} />
      </div>
      <SyncArrow />
      <div className={classes.phone}>
        <div className={classes.phoneScreen}>
          <MiniApp cardClassName={classes.receivingCard}>
            <Words className={classes.received} />
          </MiniApp>
        </div>
      </div>
    </FigureFrame>
  );
}
