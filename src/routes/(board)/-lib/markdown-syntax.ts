/**
 * 板の Markdown で使う行単位の記法 (見出しと箇条書きの記号) の判定。
 * エディタの編集コマンド (list-*.ts)、編集中の装飾 (section-markdown.ts)、まとめ表示 (organized.ts) が
 * 同じ判定を使うようにここにまとめる。基準は表示 (MarkdownView = micromark) がそう描画するかどうか
 */

/**
 * ATX 見出しの行: インデント + `#` 1〜6 個 + 空白か行末。
 * 行頭のインデントは無制限に許す: この板は codeIndented を無効にしている (markdown-disable.ts) ので、
 * micromark は 4 スペースやタブの後の `#` も見出しとして描画する (CommonMark の 3 スペース制限とは違う)。
 * `#` の直後がタブでも micromark は見出しにする。
 * [1] は `#` の並び、[2] は見出しのテキスト (閉じの `#` 列を含む。空のときは undefined)
 */
export const HEADING_RE = /^[ \t]*(#{1,6})(?:[ \t]+(.*))?$/;

/**
 * ATX 見出し行ならレベルと見出しテキスト (トリム済み) を返す。
 * 末尾の閉じ `#` 列 (空白の後) は落とす (CommonMark と同じ)
 */
export function parseHeading(line: string): { level: number; text: string } | null {
  const m = HEADING_RE.exec(line);
  if (!m) return null;
  return {
    level: m[1]!.length,
    text: (m[2] ?? "").replace(/(?:^|[ \t]+)#+[ \t]*$/, "").trim(),
  };
}

// 箇条書きの記号 (`-` / `+` / `*` / `1.` / `1)`) の正規表現の素。
// 番号は CommonMark と同じ 9 桁まで: 10 桁以上の数字で始まる行はリストではなくただの文
export const LIST_MARKER_SOURCE = String.raw`[-+*]|\d{1,9}[.)]`;

// 箇条書きの項目の行頭: インデント + 記号 + 空白。
// MarkdownView (micromark) が項目と見なす形と揃えている (記号の後に空白が必要)。
// [1] はインデント、[2] は記号、[3] は記号の後の空白
export const LIST_ITEM_RE = new RegExp(String.raw`^([ \t]*)(${LIST_MARKER_SOURCE})([ \t]+)`);
