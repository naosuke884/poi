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

/** 「利用規約 | poi」の形の文書のタイトル。ページ名が無ければトップのタイトル */
export const pageTitle = (name?: string) => (name ? `${name} | ${SITE_NAME}` : TOP_TITLE);

/**
 * トップ以外の公開ページの名前と説明文。名前は文書のタイトルと見出しに使う。
 * Worker は初期 HTML の <title> などをこれで書き換える (JS を実行しないクローラーにも区別できるように。issue #144)
 */
export const SUB_PAGES = {
  "/terms": {
    name: "利用規約",
    description: `${SITE_NAME} (${MEMO_TTL_DAYS} 日で消えるメモ帳) の利用規約です。`,
  },
  "/privacy": {
    name: "プライバシーポリシー",
    description: `${SITE_NAME} (${MEMO_TTL_DAYS} 日で消えるメモ帳) が取得する情報と、その使い方・保存・削除についての説明です。`,
  },
} as const satisfies Record<string, { name: string; description: string }>;

/**
 * 公開しているページのパス (src/routes のルートと同じ)。Worker はこれ以外のパスを 404 で返す
 * (ルートを足したらここにも足す。worker/site/pages.test.ts が routeTree.gen.ts と突き合わせる)
 */
export const PAGE_PATHS = ["/", ...(Object.keys(SUB_PAGES) as (keyof typeof SUB_PAGES)[])];
