import {
  APP_PATHS,
  pageTitle,
  SITE_ORIGIN,
  SUB_PAGES,
  TOP_DESCRIPTION,
  TOP_TITLE,
} from "@shared/site";

export type PageHead = { title: string; description: string; url: string };

/** トップ以外のページの head の中身。トップと知らないパスは index.html のまま (undefined) */
export function subPageHead(pathname: string): PageHead | undefined {
  // 板はタイトル・説明文はトップのままで、canonical (URL) だけ自分にする
  // (トップを指したままだと noindex と食い違う。issue #156)
  if ((APP_PATHS as readonly string[]).includes(pathname)) {
    return { title: TOP_TITLE, description: TOP_DESCRIPTION, url: `${SITE_ORIGIN}${pathname}` };
  }
  if (!Object.hasOwn(SUB_PAGES, pathname)) return undefined;
  const page = SUB_PAGES[pathname as keyof typeof SUB_PAGES];
  return {
    title: pageTitle(page.name),
    description: page.description,
    url: `${SITE_ORIGIN}${pathname}`,
  };
}

const escapeAttr = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/**
 * index.html の <title>・description・og:title / og:description / og:url・canonical を、そのページのものに置き換える
 * (issue #144)。index.html は小さく形も決まっているので、HTMLRewriter を使わず文字列で置き換える
 * (Vitest の node 環境でもそのまま試せる)。置き換え先が見つからないものは何もしない (head.test.ts が index.html で検査する)
 */
export function applyPageHead(html: string, head: PageHead): string {
  const title = escapeAttr(head.title);
  const description = escapeAttr(head.description);
  const url = escapeAttr(head.url);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
}
