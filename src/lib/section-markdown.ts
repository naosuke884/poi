import { Language, defineLanguageFacet, languageDataProp, syntaxTree } from "@codemirror/language";
import type { Extension, Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import {
  Autolink,
  type BlockContext,
  type LeafBlock,
  type LeafBlockParser,
  type Line,
  parser as markdownParser,
} from "@lezer/markdown";

/**
 * 編集中セクション (CodeMirror) の Markdown 言語と装飾。
 * ソースはそのまま (記号を隠さない) で、見出し・箇条書きの記号・URL だけ見た目を MarkdownView に近づける
 * (iA Writer 風)。装飾は見た目を変えるだけで doc の文字は一切変えない (replace decoration は使わない)。
 *
 * React に依存しないモジュールにしてあるのは、jsdom + node でパーサーと装飾を単体で動かして確かめるため
 * (SectionEditor は sectionMarkdown() しか使わないが、部品を個別に export しているのもそのため)。
 *
 * `@codemirror/lang-markdown` は使わない: `@codemirror/lang-html` 一式を引き込んでバンドルが大きくなる。
 * 代わりに lang-markdown の mkLang と同じことをする (`@lezer/markdown` の parser を `Language` で包む)。
 */

// 装飾に付けるクラス名 (SectionEditor.module.css が `:global(...)` で指定する)
export const MD_CLASS = {
  heading: (level: number) => `md-h${level}`,
  mark: "md-mark",
  url: "md-url",
  /** 箇条書きの行 (項目の 1 行目も、その続きの行も)。深さは CSS 変数 --md-li-depth (1 始まり) */
  listLine: "md-li",
  /** 行頭に空白も記号も無い続きの行 (lazy continuation)。ぶら下げの分を戻して本文の位置から始める */
  listLazy: "md-li-lazy",
  /** 行頭の空白 + 記号 (`  - ` / `1. `)。深さぶんの幅の箱に右寄せして、本文の開始位置を揃える */
  listPrefix: "md-li-prefix",
} as const;

// Language の言語データ facet (載せるものは無いが、Language は Document ノードに付いたものを探す)
const languageData = defineLanguageFacet();

/**
 * 段落の途中でインデント 4 以上 (またはタブ) の行に見出し / 箇条書きが来たとき段落を閉じる。
 * @lezer/markdown の BlockContext.advance() は `line.indent < baseIndent + 4` のときしか段落を割る判定
 * (endLeafBlock) をしないので、`IndentedCode` を remove しても `Notes:\n    - a` は段落の続き (lazy continuation) に
 * なる。一方 MarkdownView (micromark で codeIndented を無効化) はこれを箇条書きとして描画するため、編集中は
 * 装飾されないのに blur すると箇条書きになる、という食い違いが起きる。leaf parser の nextLine はインデントに
 * 関係なく毎行呼ばれるので、ここで段落を確定させて (行は消費しない) 次の advance() にブロックとして読ませる。
 * 段落を割れる条件は micromark と同じ: ATX 見出し、空でない箇条書き、1 で始まる空でない番号付きだけ
 */
function interruptsParagraph(line: Line): boolean {
  const text = line.text.slice(line.pos);
  return /^#{1,6}(\s|$)/.test(text) || /^[-+*]\s+\S/.test(text) || /^1[.)]\s+\S/.test(text);
}
class DeepIndentBreak implements LeafBlockParser {
  nextLine(cx: BlockContext, line: Line, leaf: LeafBlock): boolean {
    if (line.indent < line.baseIndent + 4 || !interruptsParagraph(line)) return false;
    cx.addLeafElement(
      leaf,
      cx.elt("Paragraph", leaf.start, leaf.start + leaf.content.length, cx.parser.parseInline(leaf.content, leaf.start)),
    );
    return true; // 現在行は消費しない: 次の advance() で ATXHeading / BulletList / OrderedList として読まれる
  }
  finish(): boolean {
    return false; // 通常の段落の終わりは既定の処理に任せる
  }
}

/**
 * 有効な記法を MarkdownView (micromark の disable = src/lib/markdown-disable.ts) と揃えた parser。
 * `remove` で外すのは「ブロックを飲み込む構文」と「インライン装飾」。ここで外さないと、例えば ``` の後の
 * `# 見出し` が表示では見出しなのに編集中はコードとして見える (逆も) といった食い違いが起きる。
 * 名前は @lezer/markdown の DefaultBlockParsers / DefaultInline のキー (存在しない名前は黙って無視されるので注意)。
 * `IndentedCode` を外すだけでは段落の後の深いインデントの行が段落に吸われるので、DeepIndentBreak (上記) で補う。
 * `HTMLTag` は残す: `<url>` の Autolink ノードはこのインラインパーサーが作る。
 * GFM の `Autolink` 拡張は裸 URL (https:// / www. / メールアドレス) 用。どちらもノード名は `URL`。
 *
 * 揃いきらない細部 (装飾だけの違いで、文字は変えないので許容している):
 * - `#<タブ>見出し` は micromark では見出しだが lezer は `#` の後にスペースしか認めない (タブは Tab キーで
 *   入らず、貼り付けでしか来ない)
 * - 裸 URL の境界は remark-gfm と「ほぼ同じ」: `HTTPS://` (大文字) や `_https://`、ドット無しのホスト、
 *   `<!-- -->` / `<a>` の中の URL は編集中はリンクにならず、末尾の `]` や `」` の含め方が 1 文字ずれることがある
 */
export const sectionMarkdownParser = markdownParser.configure([
  {
    remove: [
      // ブロック
      "IndentedCode", // 行頭スペース 4 つのコードブロック
      "FencedCode", // ``` コードブロック
      "Blockquote", // > 引用
      "HorizontalRule", // --- の水平線
      "HTMLBlock", // <div> などブロックの HTML
      "LinkReference", // [name]: url の参照リンク定義
      "SetextHeading", // 次の行の === / --- で見出し
      // インライン
      "Escape", // \* などのバックスラッシュエスケープ
      "Entity", // &amp; などの文字参照
      "InlineCode", // `インラインコード`
      "Emphasis", // **太字** / *斜体*
      "Link", // [text](url)
      "Image", // ![alt](url)
      "LinkEnd", // ] (Link / Image の閉じ)
    ],
    props: [languageDataProp.add({ Document: languageData })],
  },
  { parseBlock: [{ name: "DeepIndentBreak", leaf: () => new DeepIndentBreak() }] },
  Autolink,
]);

/** `syntaxTree(state)` が使えるように Language facet として state に入れる */
export const sectionMarkdownLanguage = new Language(languageData, sectionMarkdownParser, [], "markdown");

// ATXHeading1..6 → 見出し行 (見出しは 1 行なので行全体に line decoration)
const headingLine = new Map(
  [1, 2, 3, 4, 5, 6].map((level) => [
    `ATXHeading${level}`,
    Decoration.line({ class: MD_CLASS.heading(level) }),
  ]),
);
// `#` / `-` / `1.` などの記号 (薄くするだけで隠さない: カーソル移動で行の高さや幅がガタつかないように)
const markDecoration = Decoration.mark({ class: MD_CLASS.mark });
// URL (リンク色 + 下線。通常クリックはカーソル移動なので、開き方を title で示す)
const urlDecoration = Decoration.mark({
  class: MD_CLASS.url,
  attributes: { title: "Ctrl / Cmd + クリックで開く" },
});

// 箇条書きの行 (深さ × MarkdownView のリストの字下げ幅だけ本文を下げ、折り返した行も本文の位置に揃える)。
// 深さごとに Decoration を作り直さないようキャッシュする
const listLineCache = new Map<string, Decoration>();
function listLine(depth: number, lazy: boolean): Decoration {
  const key = `${depth}${lazy ? "l" : ""}`;
  let deco = listLineCache.get(key);
  if (!deco) {
    deco = Decoration.line({
      class: lazy ? `${MD_CLASS.listLine} ${MD_CLASS.listLazy}` : MD_CLASS.listLine,
      attributes: { style: `--md-li-depth:${depth}` },
    });
    listLineCache.set(key, deco);
  }
  return deco;
}
// 行頭の空白 + 記号。記号 (ListMark) 用の md-mark とは重ねない: mark 装飾が入れ子になると span が分かれ、
// inline-block の箱が 1 つにならない。薄い色はこのクラスで付ける
const listPrefixDecoration = Decoration.mark({ class: MD_CLASS.listPrefix });

/**
 * 箇条書きの行ごとの情報を構文木から集める。
 * depth は ListItem の入れ子の深さ (1 始まり)。行が複数の ListItem に含まれる (親の範囲は子の行も含む) ときは
 * 最も深いもの。prefixTo は項目の 1 行目の「空白 + 記号 (+ 直後のスペース)」の終わり。続きの行では行頭の空白の終わり
 */
type ListLineInfo = { depth: number; prefixTo: number | null };

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { doc } = view.state;
  const tree = syntaxTree(view.state);
  const listLines = new Map<number, ListLineInfo>();
  for (const { from, to } of view.visibleRanges) {
    let depth = 0;
    tree.iterate({
      from,
      to,
      enter(node) {
        const heading = headingLine.get(node.name);
        if (heading) {
          ranges.push(heading.range(doc.lineAt(node.from).from));
        } else if (node.name === "HeaderMark") {
          ranges.push(markDecoration.range(node.from, node.to));
        } else if (node.name === "URL") {
          ranges.push(urlDecoration.range(node.from, node.to));
        } else if (node.name === "ListItem") {
          depth++;
          const first = doc.lineAt(node.from);
          const last = doc.lineAt(node.to);
          for (let n = first.number; n <= last.number; n++) {
            const info = listLines.get(n);
            if (!info) listLines.set(n, { depth, prefixTo: null });
            else info.depth = Math.max(info.depth, depth);
          }
          // 1 行目: 記号の直後のスペース (貼り付けで入るタブも) までを prefix にする (`- ` で本文の位置が決まる。
          // タブを箱の外に残すと本文がタブ幅ぶん右にずれる)
          const mark = node.node.getChild("ListMark");
          if (mark) {
            const after = doc.sliceString(mark.to, mark.to + 1);
            listLines.get(first.number)!.prefixTo = after === " " || after === "\t" ? mark.to + 1 : mark.to;
          }
        }
      },
      leave(node) {
        if (node.name === "ListItem") depth--;
      },
    });
  }
  for (const [n, info] of listLines) {
    const line = doc.line(n);
    // 続きの行 (記号なし): 行頭の空白を prefix にする。空白も無ければ lazy (本文が行頭から始まる)
    const prefixTo = info.prefixTo ?? line.from + (/^[ \t]*/.exec(line.text)?.[0].length ?? 0);
    ranges.push(listLine(info.depth, prefixTo === line.from).range(line.from));
    if (prefixTo > line.from) ranges.push(listPrefixDecoration.range(line.from, prefixTo));
  }
  // 行装飾と mark が混ざり、visibleRanges の順にも依存するので sort させる
  return Decoration.set(ranges, true);
}

/** 構文木から装飾を作る。木は非同期に育つので、木が変わったときも作り直す */
export const sectionMarkdownDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/**
 * URL ノードの文字列を開ける href にする。
 * GFM の Autolink は `www.example.com` やメールアドレスもスキーム無しで URL にするので補う
 * (micromark の gfm-autolink-literal と同じ: www. は http://、メールアドレスは mailto:)
 */
export function urlHref(text: string): string {
  if (/^[a-z][-\w+.]*:/i.test(text)) return text;
  if (text.includes("@")) return `mailto:${text}`;
  return `http://${text}`;
}

/** pos を含む URL ノードの文字列 (無ければ null) */
function urlAt(view: EditorView, pos: number): string | null {
  const tree = syntaxTree(view.state);
  for (let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, 1); node; node = node.parent) {
    if (node.name === "URL") return view.state.sliceDoc(node.from, node.to);
  }
  return null;
}

/**
 * Ctrl / Cmd + クリックで URL を新しいタブで開く。通常クリックは編集中なのでカーソル移動のまま。
 * mousedown で処理して true を返し、CodeMirror が Ctrl+クリックを複数カーソルの追加として扱わないようにする
 */
export const sectionMarkdownLinkOpener = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false;
    const target = event.target instanceof Element ? event.target.closest(`.${MD_CLASS.url}`) : null;
    if (!target) return false;
    // mark 装飾は他の装飾と重なると複数の span に分かれるので、クリックした span の位置から構文木で URL 全体を得る
    const url = urlAt(view, view.posAtDOM(target));
    if (url === null) return false;
    event.preventDefault();
    window.open(urlHref(url), "_blank", "noopener");
    return true;
  },
});

/** 編集中セクションの Markdown 一式 (言語 + 装飾 + リンクを開く) */
export function sectionMarkdown(): Extension {
  return [sectionMarkdownLanguage, sectionMarkdownDecorations, sectionMarkdownLinkOpener];
}
