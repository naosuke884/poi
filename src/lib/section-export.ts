/**
 * セクションの持ち出し (コピー / スクショ)。
 * - コピーは Markdown のテキストをそのままクリップボードへ
 * - スクショは Markdown 表示の DOM をそのまま PNG にする (modern-screenshot: DOM → SVG foreignObject → canvas)。
 *   ページの背景色と余白を付け、端末の devicePixelRatio (最低 2) で描く。
 *   Inter (同梱 woff2) はライブラリが @font-face を埋め込む。日本語はシステムフォントなので画面と同じ見た目になる
 * - 画像はクリップボードに入れる (ClipboardItem。そのまま Slack / LINE などに貼れる)。
 *   対応していない環境 (Firefox の古い版など) や書き込みが拒否されたときはファイルとしてダウンロードする。
 *   Safari はユーザー操作から離れた (await 後の) clipboard.write を拒否するので、Blob の Promise を
 *   ClipboardItem に渡してクリック時点で書き込みを始める
 */

export async function copySectionText(content: string): Promise<void> {
  await navigator.clipboard.writeText(content);
}

// 画像の余白 (px)
const PAD_Y = 16;
const PAD_X = 20;

export async function renderSectionImage(el: HTMLElement): Promise<Blob> {
  // スクショを撮るときだけ読み込む (初期バンドルに入れない)
  const { domToBlob } = await import("modern-screenshot");
  const background = getComputedStyle(document.body).backgroundColor;
  return domToBlob(el, {
    type: "image/png",
    scale: Math.max(2, window.devicePixelRatio || 1),
    backgroundColor: background,
    style: { padding: `${PAD_Y}px ${PAD_X}px`, boxSizing: "border-box" },
    // 余白の分だけ広げる (指定しないと元の要素の大きさで切られて余白の分だけ右下が欠ける)
    width: el.offsetWidth + PAD_X * 2,
    height: el.offsetHeight + PAD_Y * 2,
  });
}

/** 画像をクリップボードへ。返り値は届け先 (clipboard / download) */
export async function deliverImage(blob: Promise<Blob>): Promise<"clipboard" | "download"> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return "clipboard";
    } catch (e) {
      // 拒否された / 未対応 (Promise を受け付けない古い実装など) → ダウンロードへ
      console.warn("clipboard.write failed; falling back to download", e);
    }
  }
  download(await blob, `poi-${fileStamp()}.png`);
  return "download";
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // click の処理が始まる前に revoke すると失敗する (特に Safari) ので少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ファイル名用 YYYYMMDD-HHMMSS (端末のタイムゾーン)
function fileStamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  );
}
