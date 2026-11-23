import { describe, expect, it } from "vite-plus/test";

import { allowedPreviewUrl } from "./url-guard";

const ok = (url: string) => allowedPreviewUrl(url, "poi.example")?.toString() ?? null;

describe("allowedPreviewUrl", () => {
  it("http / https の、名前で引く普通のサイトは通す", () => {
    expect(ok("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(ok("http://news.example.co.jp/")).toBe("http://news.example.co.jp/");
  });

  it("http / https 以外、既定でないポート、認証情報の入った URL は通さない", () => {
    for (const url of [
      "ftp://example.com/",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "https://example.com:8443/",
      "https://user:pass@example.com/",
      "not a url",
    ]) {
      expect(ok(url)).toBeNull();
    }
  });

  it("IP アドレスそのもの・手元や内部のホスト・ドットの無い名前・この Worker 自身は通さない", () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://localhost/",
      "http://app.localhost/",
      "http://printer.local/",
      "http://db.internal/",
      "http://intranet/",
      "https://poi.example/api/board",
      "https://POI.example/",
      // 10 進や 16 進で書いた IP アドレス (URL が 127.0.0.1 に読み替える)
      "http://2130706433/",
      "http://0x7f.1/",
      // 末尾にドットを付けた完全修飾の書き方も、同じ場所を指す
      "http://localhost./",
      "http://printer.local./",
      "http://db.internal../",
      "https://poi.example./api/board",
    ]) {
      expect(ok(url)).toBeNull();
    }
  });
});
