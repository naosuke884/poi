import { describe, expect, it } from "vitest";
import { buildSitemap } from "./sitemap";

describe("buildSitemap", () => {
  it("ページごとに絶対 URL の <url> を並べる (issue #149)", () => {
    expect(buildSitemap("https://poinote.app", ["/", "/terms"])).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://poinote.app/</loc></url>
  <url><loc>https://poinote.app/terms</loc></url>
</urlset>
`,
    );
  });

  it("URL の & はエスケープする", () => {
    expect(buildSitemap("https://example.com", ["/a?b=1&c=2"])).toContain(
      "<loc>https://example.com/a?b=1&amp;c=2</loc>",
    );
  });
});
