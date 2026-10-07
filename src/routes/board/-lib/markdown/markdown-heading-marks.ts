import type { Element, Root } from "hast";
import type { Plugin } from "unified";

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/**
 * 見出しに、エディタでその行の頭に見える記号 (`## ` など。行頭の空白も含む) を data-heading-mark として付ける
 * rehype プラグイン。
 *
 * エディタは見出しの記号を隠さずに見せるので、見出しの 1 行目は記号の幅だけ文字が入る幅が狭い。
 * 表示では記号が無いので、狭い画面では長い見出しの折り返し位置が変わり、表示と編集で行の数がずれて
 * 下の行が上下に動く。MarkdownView.module.css はこの文字列を見えない float にして 1 行目の右端に置き、
 * 表示の 1 行目もエディタと同じ幅だけ狭める (文字は同じフォント・大きさなので幅は必ず同じになる)。
 * - 付けるのは行頭から始まる ATX 見出し (`# 見出し`) だけ。箇条書きの中の見出し (`- ## 見出し`) などは
 *   行頭に別の記号があり、表示でもその分の字下げがあるので対象外
 * - 見出しの本文が空 (`## `) なら行全体が記号
 */
export const rehypeHeadingMarks: Plugin<[], Root> = () => (tree, file) => {
  const source = String(file.value ?? "");
  const visit = (node: Root | Element) => {
    for (const child of node.children) {
      if (child.type !== "element") continue;
      if (HEADINGS.has(child.tagName)) {
        const mark = headingMark(source, child);
        if (mark) child.properties.dataHeadingMark = mark;
      } else {
        visit(child);
      }
    }
  };
  visit(tree);
};

/** 見出しの行頭から本文の始まりまでの元テキスト。行頭に空白以外があれば (入れ子の見出し) undefined */
function headingMark(source: string, heading: Element): string | undefined {
  const start = heading.position?.start.offset;
  const end = heading.position?.end.offset;
  if (start === undefined || end === undefined) return undefined;
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  if (source.slice(lineStart, start).trim() !== "") return undefined;
  const contentStart = heading.children[0]?.position?.start.offset ?? end;
  const mark = source.slice(lineStart, contentStart);
  return mark.startsWith("#", mark.length - mark.trimStart().length) ? mark : undefined;
}
