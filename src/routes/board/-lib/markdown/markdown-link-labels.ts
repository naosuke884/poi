import type { Element, ElementContent, Root } from "hast";
import type { Plugin } from "unified";

/**
 * URL のリンクの表示を、読める短い形 (ドメイン + 縮めたパス) にする rehype プラグイン。
 * href はそのままで、表示の文字だけを変える。
 *
 * 表示はドメイン (data-link-host) と残り (data-link-rest) の 2 つの span に分け、
 * MarkdownView.module.css が 1 行に収めて、はみ出す分を残りの側から … で切る (ドメインは最後まで残す)。
 * - `https://` と `www.` を外す。パス・クエリ・# の後ろの %XX は読める文字に戻す
 * - パスが長ければ途中を … にして、先頭 2 つと最後の 1 つを残す (記事のスラッグや番号は末尾にあることが多い)
 * - 追跡用のクエリ (utm_* など) は表示しない
 * - 対象は http / https の URL だけが文字になっているリンク (板では [text](url) 記法を無効にしているので、
 *   リンクはすべて裸の URL か `<url>`)。mailto: のメールアドレスはそのまま
 *
 * 縮めたリンクには data-link-label を付ける。表示の文字が元テキストと一致しなくなるので、
 * markdown-source-offset.ts はこの要素の中を元テキストと突き合わせず、リンク全体を 1 つとして扱う
 */
export const rehypeLinkLabels: Plugin<[], Root> = () => (tree) => {
  const visit = (node: Root | Element) => {
    for (const child of node.children) {
      if (child.type !== "element") continue;
      if (child.tagName === "a") shortenLink(child);
      else visit(child);
    }
  };
  visit(tree);
};

function shortenLink(a: Element) {
  const [text, ...others] = a.children;
  if (text?.type !== "text" || others.length > 0) return;
  const href = a.properties.href;
  if (typeof href !== "string") return;
  const label = urlLabel(href);
  if (!label) return;
  a.properties.dataLinkLabel = "";
  const span = (prop: string, value: string): ElementContent => ({
    type: "element",
    tagName: "span",
    properties: { [prop]: "" },
    children: [{ type: "text", value }],
  });
  a.children = label.rest
    ? [span("dataLinkHost", label.host), span("dataLinkRest", label.rest)]
    : [span("dataLinkHost", label.host)];
}

// 広告・SNS の共有で付く、ページの中身を変えないクエリ
const TRACKING_PARAM =
  /^(?:utm_.+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|igshid|mc_cid|mc_eid|si)$/;

/** パスの区切りがこれより多ければ途中を … にする */
const MAX_PATH_SEGMENTS = 3;

function urlLabel(href: string): { host: string; rest: string } | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.host.replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean).map(decode);
  const path =
    segments.length > MAX_PATH_SEGMENTS
      ? [...segments.slice(0, 2), "…", segments.at(-1)]
      : segments;
  // URLSearchParams は %XX と + を戻した値を返す
  const params = [...url.searchParams].filter(([key]) => !TRACKING_PARAM.test(key));
  const query = params.map(([key, value]) => (value ? `${key}=${value}` : key)).join("&");
  const rest =
    (path.length > 0 ? `/${path.join("/")}` : "") +
    (query ? `?${query}` : "") +
    (url.hash.length > 1 ? decode(url.hash) : "");
  return { host, rest };
}

/** %XX を文字に戻す。壊れた %XX (`%E3%81` だけなど) を含むときは元のまま */
function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
