import { MEMO_TTL_DAYS } from "./constants";

// サイトの名前と、検索結果・リンクのカードに出す文言。index.html の <title> / description / og:* と、
// ページを移ったときの document.title (src/lib/use-document-title.ts) で同じ文字列を使う
// (index.html は静的なので同じ文言を直書きしている。食い違いは worker/index.test.ts で検査する)
export const SITE_NAME = "poi";
export const SITE_ORIGIN = "https://poinote.app";

/** トップ (ランディング / 板) のタイトル。「poi」だけでは何のサービスか伝わらないので一言添える */
export const TOP_TITLE = `${SITE_NAME} - ${MEMO_TTL_DAYS} 日で消えるメモ帳`;

/** トップの説明文 (meta description / og:description) */
export const TOP_DESCRIPTION = `書いたメモが ${MEMO_TTL_DAYS} 日で自動で消えるメモ帳です。片付けを気にせず、思いついたまま書けます。Markdown に対応し、スマホのホーム画面に追加しても使えます。`;

/**
 * 公開しているページのパス (src/routes のルートと同じ)。Worker はこれ以外のパスを 404 で返す
 * (ルートを足したらここにも足す。worker/site/pages.test.ts が routeTree.gen.ts と突き合わせる)
 */
export const PAGE_PATHS = ["/", "/terms", "/privacy"] as const;
