import type { Element, Root } from "hast";
import type { Plugin } from "unified";

/**
 * 要素の前にある空行の数を data-blank-lines="n" として付ける rehype プラグイン (空行が無ければ付けない)。
 *
 * エディタは空行を 1 行ぶんの高さでそのまま見せるが、Markdown の HTML では空行が消える
 * (「# 見出し\n本文」と「# 見出し\n\n本文」が同じ HTML になる)。
 * 表示の余白をエディタに合わせる (切り替えで下の行が上下に動かないようにする。issue #117) には
 * 空行があったかどうかが要るので、パーサーが持っている行番号から数えて CSS (MarkdownView.module.css) に渡す。
 * - 数えるのは直前の兄弟要素の終わりの行との間 (間の行はどの要素にも属さないので空行)
 * - 一番外側の最初の要素は、セクションの先頭からの行数 (先頭の空行)
 * - 入れ子の最初の要素 (項目の中の最初の段落など) には付けない (前にあるのは親の記号の行)
 */
export const rehypeBlankLines: Plugin<[], Root> = () => (tree) => {
  const visit = (node: Root | Element) => {
    let prevEndLine: number | undefined = node.type === "root" ? 0 : undefined;
    for (const child of node.children) {
      if (child.type !== "element") continue;
      const start = child.position?.start.line;
      if (start !== undefined && prevEndLine !== undefined && start - prevEndLine > 1) {
        child.properties.dataBlankLines = start - prevEndLine - 1;
      }
      prevEndLine = child.position?.end.line;
      visit(child);
    }
  };
  visit(tree);
};
