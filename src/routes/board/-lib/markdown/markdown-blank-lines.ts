import type { Element, Root } from "hast";
import type { Plugin } from "unified";

/**
 * 要素の前にある空行の数を data-blank-lines="n" と CSS 変数 --blank-lines: n として付ける rehype プラグイン
 * (空行が無ければ付けない)。余白の高さは数に比例するので、CSS が数を読めるよう変数でも渡す
 * (attr() で数値を読むのはまだ一部のブラウザだけ)。
 *
 * エディタは空行を 1 行ぶんの高さでそのまま見せるが、Markdown の HTML では空行が消える
 * (「# 見出し\n本文」と「# 見出し\n\n本文」が同じ HTML になる)。
 * 表示の余白をエディタに合わせる (切り替えで下の行が上下に動かないようにする。issue #117) には
 * 空行があったかどうかが要るので、パーサーが持っている行番号から数えて CSS (MarkdownView.module.css) に渡す。
 * - 数えるのは直前の兄弟要素の終わりの行との間 (間の行はどの要素にも属さないので空行)
 * - 一番外側の最初の要素は、セクションの先頭からの行数 (先頭の空行)
 * - 入れ子の最初の要素 (項目の中の最初の段落など) には付けない (前にあるのは親の記号の行)
 * - 末尾の空行は、空の div (data-trailing-blank-lines) を最後に足して表す
 */
/** 末尾の空行の空き (rehypeBlankLines が最後に足す、中身の無い要素) を選ぶセレクタ */
export const TRAILING_BLANK_LINES = "[data-trailing-blank-lines]";

export const rehypeBlankLines: Plugin<[], Root> = () => (tree) => {
  const visit = (node: Root | Element) => {
    let prevEndLine: number | undefined = node.type === "root" ? 0 : undefined;
    for (const child of node.children) {
      if (child.type !== "element") continue;
      const start = child.position?.start.line;
      if (start !== undefined && prevEndLine !== undefined && start - prevEndLine > 1) {
        const count = start - prevEndLine - 1;
        child.properties.dataBlankLines = count;
        child.properties.style = `--blank-lines: ${count}`;
      }
      prevEndLine = child.position?.end.line;
      visit(child);
    }
  };
  visit(tree);
  // 末尾の空行: 最後の要素の終わりからセクションの終わりまでの行。エディタはそのぶんの高さを見せるので、表示にも同じ高さの
  // 空きを最後に置く (無いと、編集を始める / やめるたびにカードの高さが変わり、下のセクションが上下に動く)
  // 元テキストの範囲 (data-pos。rehypeSourcePositions と同じ形) は、最後の要素の直後の改行の次から末尾まで
  // (空行のそれぞれの先頭の位置。markdown-source-offset が、この空きの中の行と元テキストの位置を対応付ける)
  const lastEnd = tree.children.findLast((c) => c.type === "element")?.position?.end;
  const end = tree.position?.end;
  if (lastEnd?.offset !== undefined && end?.offset !== undefined && end.line > lastEnd.line) {
    const count = end.line - lastEnd.line;
    tree.children.push({
      type: "element",
      tagName: "div",
      properties: {
        dataTrailingBlankLines: count,
        dataPos: `${lastEnd.offset + 1}-${end.offset}`,
        style: `--blank-lines: ${count}`,
        ariaHidden: "true",
      },
      children: [],
    });
  }
};
