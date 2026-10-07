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
  "/guide": {
    name: "使い方",
    description: `${SITE_NAME} (${MEMO_TTL_DAYS} 日で消えるメモ帳) の使い方です。メモの書き方、メモが消えるしくみと保存期間の変え方、見出しごとのまとめ表示、スマホのホーム画面への追加を説明します。`,
  },
  "/faq": {
    name: "よくある質問",
    description: `${SITE_NAME} (${MEMO_TTL_DAYS} 日で消えるメモ帳) についてのよくある質問です。消えたメモは戻せるか、保存期間は変えられるか、無料か、スマホで使えるかなどに答えます。`,
  },
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
 * ログインして使う画面のパス。検索結果に出しても未ログインの人はランディングへ戻されるだけなので、
 * sitemap に載せず noindex にする (issue #156)
 */
export const APP_PATHS = ["/board"] as const;

/** 検索エンジンに知らせるページのパス (sitemap.xml に載せる) */
export const INDEXED_PAGE_PATHS = [
  "/",
  ...(Object.keys(SUB_PAGES) as (keyof typeof SUB_PAGES)[]),
] as const;

/**
 * ページのパス (src/routes のルートと同じ)。Worker はこれ以外のパスを 404 で返す
 * (ルートを足したらここにも足す。worker/site/pages.test.ts が routeTree.gen.ts と突き合わせる)
 */
export const PAGE_PATHS = [...INDEXED_PAGE_PATHS, ...APP_PATHS];
