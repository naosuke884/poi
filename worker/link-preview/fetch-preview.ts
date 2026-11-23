import { charsetOf, type LinkPreview, parsePreview } from "./parse-preview";
import { allowedPreviewUrl } from "./url-guard";

/** 待つ時間の上限 (遅いサイトで板の表示を待たせない。プレビューは無くても困らない) */
const TIMEOUT_MS = 5000;
/** 読む量の上限 (題名は <head> にあるので、先頭だけで足りる) */
const MAX_BYTES = 128 * 1024;
/** たどるリダイレクトの数の上限 */
const MAX_REDIRECTS = 3;

/**
 * url のページを取ってきて、題名とサイト名を返す。取れない・HTML でない・題名が無いときは null (理由は区別しない)。
 * 例外は投げない: 投げるとエラーのログにメモの中身 (URL) が出てしまう (HAY-223)。
 * リダイレクトは自分でたどり、行き先ごとに取りに行ってよいかを確かめ直す (許した URL から、許さない場所へ飛ばされないように)。
 * cookie や転送元の情報は送らない (fetch に渡すのは URL と最小のヘッダーだけ)
 */
export async function fetchPreview(
  input: string,
  selfHost: string,
  fetcher: typeof fetch = fetch,
): Promise<LinkPreview | null> {
  try {
    let url = allowedPreviewUrl(input, selfHost);
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    for (let hop = 0; url !== null && hop <= MAX_REDIRECTS; hop++) {
      const res = await fetcher(url.toString(), {
        redirect: "manual",
        signal,
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "ja,en;q=0.8",
          "user-agent": "poi-link-preview/1.0",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel();
        url =
          location === null ? null : allowedPreviewUrl(new URL(location, url).toString(), selfHost);
        continue;
      }
      const type = res.headers.get("content-type");
      if (!res.ok || !/^\s*(text\/html|application\/xhtml\+xml)\b/i.test(type ?? "")) {
        await res.body?.cancel();
        return null;
      }
      const bytes = await readHead(res, MAX_BYTES);
      // <meta charset> は先頭 1024 バイトの中に書く決まり (HTML の仕様) なので、文字コードはそこだけで探す
      // (全部を一度 utf-8 で読んでから読み直すと、多くのページで同じ 128KB を 2 回読むことになる)
      const html = decode(
        bytes,
        bomCharset(bytes) ??
          charsetOf(type, new TextDecoder("utf-8").decode(bytes.subarray(0, 1024))),
      );
      return parsePreview(html);
    }
    return null;
  } catch {
    return null;
  }
}

/** 本文の先頭 limit バイトだけを読む (残りは読まずに切る) */
async function readHead(res: Response, limit: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel();
  const out = new Uint8Array(Math.min(size, limit));
  let at = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, out.length - at);
    out.set(part, at);
    at += part.length;
    if (at >= out.length) break;
  }
  return out;
}

/** 先頭のバイト順マーク (BOM) が示す文字コード。HTML の仕様どおり、Content-Type や <meta> の指定より先に見る */
function bomCharset(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  return null;
}

/**
 * 文字コードで読む (日本語のサイトに多い Shift_JIS / EUC-JP も TextDecoder が読める)。charset は bomCharset か
 * charsetOf が返した、TextDecoder の知っている名前
 */
function decode(bytes: Uint8Array, charset: string): string {
  return new TextDecoder(charset).decode(bytes);
}
