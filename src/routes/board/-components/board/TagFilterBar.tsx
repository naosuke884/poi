import type { TagIcon } from "@shared/constants";
import { memo, type Ref, useEffect, useRef, useState } from "react";

import { TagIconSvg } from "@/components/TagIcon";

import type { Tag } from "../../-lib/data/tags";
import { sameFilter, type TagFilter } from "../../-lib/tag-filter";

import classes from "./TagFilterBar.module.css";

/**
 * 板の上の絞り込み: 「すべて」「タグなし」と、タグごとのボタン (タグの札と同じ形)。押したものに当てはまるセクションだけを板に出す。
 * どれか 1 つが選ばれている (押してあるボタンは aria-pressed)。
 * 「タグなし」は「すべて」の隣に置く (タグの後ろに置くと、タグが多いとき行の奥まで送らないと押せない)。
 * 「すべて」「タグなし」は左に留め、区切り線の右のタグだけを横にスクロールする。その先にまだボタンがある端をぼかす
 * (端で札が切れるだけでは、続きがあると気づきにくい)。
 * タグが 1 つも無ければ Board はこれを出さない (タグを使わない人の板は今までどおり)。
 * ref は外側の要素 (Board は、フォーカスの行き先が無くなったときに選んでいるボタンへ移す)
 */
export const TagFilterBar = memo(TagFilterBarView, (prev, next) => {
  // 板は 1 文字打つごとに描き直す。選べるタグ (tags) は中身が変わったときだけ作り直されるので、同じ配列なら描き直さない
  // (タグの数だけボタンとアイコンがある)。filter は選ぶたびに作り直されるので中身で比べる
  return (
    prev.tags === next.tags &&
    sameFilter(prev.filter, next.filter) &&
    prev.onChange === next.onChange &&
    prev.ref === next.ref
  );
});

function TagFilterBarView({
  tags,
  filter,
  onChange,
  ref,
}: {
  /** 選べるタグ (登録した順) */
  tags: Tag[];
  filter: TagFilter;
  onChange: (filter: TagFilter) => void;
  ref?: Ref<HTMLDivElement>;
}) {
  // タグの札と同じ形のボタン。選んでいるものだけを札の灰色で塗る
  const item = (label: string, value: TagFilter, icon?: TagIcon) => (
    <button
      type="button"
      className={classes.item}
      aria-pressed={sameFilter(filter, value)}
      onClick={() => onChange(value)}
    >
      {value.kind === "tag" && <TagIconSvg icon={icon} size={14} />}
      {label}
    </button>
  );
  const { ref: scrollerRef, overflow } = useScrollEdges(tags);
  return (
    <div ref={ref} className={classes.root}>
      <div role="group" aria-label="タグで絞り込む" className={classes.bar}>
        {/* 「すべて」「タグなし」は送らずに左に留める (タグの奥まで送っても、すぐ全体に戻れるように) */}
        <div className={classes.fixed}>
          {item("すべて", { kind: "all" })}
          {item("タグなし", { kind: "untagged" })}
        </div>
        <div className={classes.divider} />
        <div
          className={classes.tags}
          data-more-start={overflow.start ? "" : undefined}
          data-more-end={overflow.end ? "" : undefined}
        >
          <div ref={scrollerRef} className={classes.scroller}>
            {tags.map((tag) => (
              <span key={tag.id} className={classes.slot}>
                {item(tag.name, { kind: "tag", tagId: tag.id }, tag.icon)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 横にスクロールする要素の、左右にまだ隠れたぶんがあるか (スクロール・大きさ・中身が変わるたびに見直す)。
 * content は中身 (並べるタグ)。中身が変わったときだけ作り直される配列で、板は 1 文字ごとに描き直すので、そのたびに付け直さない
 */
function useScrollEdges(content: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      // 端数のずれ (拡大表示など) で、端まで送っても 1px 残ることがある
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setOverflow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    // ResizeObserver の無い環境 (テストの jsdom) では、スクロールのたびの見直しだけにする
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(el);
    for (const child of el.children) observer?.observe(child);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [content]);
  return { ref, overflow };
}
