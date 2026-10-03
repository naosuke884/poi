const escapeXml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * 公開ページの一覧から sitemap.xml を作る (issue #149)。手書きのファイルだとページを増やしたときに
 * 書き足しを忘れるので、Worker が PAGE_PATHS (shared/site.ts) から毎回組み立てる
 */
export function buildSitemap(origin: string, paths: readonly string[]): string {
  const urls = paths.map((p) => `  <url><loc>${escapeXml(`${origin}${p}`)}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
