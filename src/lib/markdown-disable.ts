import type { Plugin } from "unified";

/**
 * Markdown の構文を名前で無効化する remark プラグイン (ブラックリスト)。
 * micromark (react-markdown のパーサー) の disable 拡張をそのまま使う。
 * 無効化した記法はパースされず、書いた文字がそのまま表示される。
 *
 * 構文名は micromark の construct の name (lib/constructs.js) / micromark-extension-gfm のもの。
 * 例: codeIndented, setextUnderline, htmlFlow, htmlText, thematicBreak, labelStartImage, table
 */
export const remarkDisable: Plugin<[readonly string[]]> = function (names) {
  // micromarkExtensions は remark-parse が unified の Data に足すフィールド (型はここでは見えないのでキャスト)
  const data = this.data() as { micromarkExtensions?: unknown[] };
  (data.micromarkExtensions ??= []).push({ disable: { null: [...names] } });
};

/**
 * 板で無効にする Markdown 記法。
 * メモ用途なので、使えるのは「# 見出し」「- 箇条書き / 1. 番号付き」と URL の自動リンク
 * (裸の URL: remark-gfm、<url>: autolink) だけ。それ以外の記法は書いた文字がそのまま表示される。
 * (裸の URL の自動リンクは構文ではなくパース後の処理なので、消すなら remark-gfm ごと外す。
 *  autolink を消すと <url> の末尾 > まで裸 URL として拾われるので残している)
 */
export const BOARD_MARKDOWN_DISABLED: readonly string[] = [
  // 見出しの別記法・区切り
  "setextUnderline", // 次の行の === / --- で見出し
  "thematicBreak", // --- の水平線 (セクションの区切り線と紛らわしい)
  // インライン装飾
  "attention", // **太字** / *斜体* (2*3 や snake_case で誤発動する)
  "codeText", // `インラインコード`
  "strikethrough", // ~~打ち消し~~ (GFM)
  // ブロック
  "codeIndented", // 行頭スペース 4 つのコードブロック (箇条書きをインデントしただけで発動する)
  "codeFenced", // ``` コードブロック
  "blockQuote", // > 引用 (行頭の > で意図せず発動する)
  "table", // | 表 | (GFM)
  "tasklistCheck", // - [ ] の TODO チェックボックス (GFM。表示専用でトグルできず、壊れて見える)
  // リンク・画像
  "labelStartLink", // [text](url) (裸の URL の自動リンクで足りる)
  "labelStartImage", // ![alt](url) (外部画像を勝手に読みに行く)
  "definition", // [name]: url の参照リンク定義 (書いた行が消える)
  "gfmFootnoteDefinition", // [^1]: 脚注 (GFM)
  "gfmFootnoteCall",
  "gfmPotentialFootnoteCall",
  // HTML・エスケープ
  "htmlFlow", // <div> などブロックの HTML (無視されて消えるより、文字として残す)
  "htmlText", // <span> などインラインの HTML (同上)
  "characterReference", // &amp; &copy; などの文字参照 (& を含む文で化ける)
  "characterEscape", // \* などのバックスラッシュエスケープ (\ が消える)
];
