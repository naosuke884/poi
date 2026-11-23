import { describe, expect, it } from "vite-plus/test";

import { fetchPreview } from "./fetch-preview";

// 外のサイトの代わり: URL ごとに返すレスポンスを決め、届いたリクエストを控える
function fakeSites(sites: Record<string, () => Response>) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    requests.push({ url, init });
    const site = sites[url];
    if (!site) throw new TypeError("network error");
    return site();
  }) as typeof fetch;
  return { fetcher, requests };
}

const html = (body: string, type = "text/html; charset=utf-8") =>
  new Response(body, { headers: { "content-type": type } });
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

describe("fetchPreview", () => {
  it("ページの題名とサイト名を返し、cookie などの資格情報は送らない", async () => {
    const { fetcher, requests } = fakeSites({
      "https://example.com/a": () =>
        html('<meta property="og:title" content="A"><meta property="og:site_name" content="Ex">'),
    });
    expect(await fetchPreview("https://example.com/a", "poi.example", fetcher)).toEqual({
      title: "A",
      siteName: "Ex",
    });
    const headers = new Headers(requests[0]!.init?.headers);
    expect(headers.has("cookie")).toBe(false);
    expect(headers.has("authorization")).toBe(false);
    expect(requests[0]!.init?.redirect).toBe("manual");
  });

  it("リダイレクトをたどり、行き先が取りに行ってはいけない場所なら取りに行かない", async () => {
    const { fetcher, requests } = fakeSites({
      "https://example.com/short": () => redirect("/long"),
      "https://example.com/long": () => html("<title>着いた</title>"),
      "https://evil.example/": () => redirect("http://127.0.0.1/admin"),
    });
    expect(await fetchPreview("https://example.com/short", "poi.example", fetcher)).toEqual({
      title: "着いた",
      siteName: null,
    });
    expect(await fetchPreview("https://evil.example/", "poi.example", fetcher)).toBeNull();
    expect(requests.map((r) => r.url)).not.toContain("http://127.0.0.1/admin");
  });

  it("リダイレクトが続きすぎたら諦める", async () => {
    const { fetcher, requests } = fakeSites(
      Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [
          `https://example.com/${i}`,
          () => redirect(`/${i + 1}`),
        ]),
      ),
    );
    expect(await fetchPreview("https://example.com/0", "poi.example", fetcher)).toBeNull();
    expect(requests.length).toBeLessThanOrEqual(4);
  });

  it("取りに行ってはいけない URL・HTML でない・失敗・届かないときは null で、例外は投げない", async () => {
    const { fetcher, requests } = fakeSites({
      "https://example.com/img": () =>
        new Response("x", { headers: { "content-type": "image/png" } }),
      "https://example.com/404": () =>
        new Response("<title>無い</title>", {
          status: 404,
          headers: { "content-type": "text/html" },
        }),
    });
    expect(await fetchPreview("http://localhost/", "poi.example", fetcher)).toBeNull();
    expect(requests).toEqual([]);
    expect(await fetchPreview("https://example.com/img", "poi.example", fetcher)).toBeNull();
    expect(await fetchPreview("https://example.com/404", "poi.example", fetcher)).toBeNull();
    expect(await fetchPreview("https://example.com/down", "poi.example", fetcher)).toBeNull();
  });

  it("Shift_JIS のページも読める", async () => {
    // 「日本語」の Shift_JIS
    const sjis = new Uint8Array([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]);
    const body = new Uint8Array([
      ...new TextEncoder().encode("<title>"),
      ...sjis,
      ...new TextEncoder().encode("</title>"),
    ]);
    const { fetcher } = fakeSites({
      "https://example.jp/": () =>
        new Response(body, { headers: { "content-type": "text/html; charset=Shift_JIS" } }),
    });
    expect(await fetchPreview("https://example.jp/", "poi.example", fetcher)).toEqual({
      title: "日本語",
      siteName: null,
    });
  });

  it("先頭のバイト順マーク (BOM) で文字コードを決める (charset の指定より先に)", async () => {
    // UTF-16LE: BOM (FF FE) の後に、各 UTF-16 の単位を下位バイト・上位バイトの順に並べる
    const text = "<title>題名</title>";
    const units = Array.from({ length: text.length }, (_, k) => text.charCodeAt(k));
    const utf16le = new Uint8Array([0xff, 0xfe, ...units.flatMap((u) => [u & 0xff, u >> 8])]);
    const { fetcher } = fakeSites({
      "https://example.com/": () =>
        new Response(utf16le, { headers: { "content-type": "text/html; charset=shift_jis" } }),
    });
    expect(await fetchPreview("https://example.com/", "poi.example", fetcher)).toEqual({
      title: "題名",
      siteName: null,
    });
  });
});
