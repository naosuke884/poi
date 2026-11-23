// リンクのプレビューのために、サーバ (Worker) から取りに行ってよい URL かを決める。
// 利用者が書いた URL をそのままサーバから取りに行くと、外からは届かない場所 (この Worker 自身、
// 手元で動かしている開発用のサーバ、社内のホストなど) を代わりに叩かせる踏み台になりうるので、狭く絞る

/** IPv4 / IPv6 のアドレスそのもの (名前を引かずに、特定のアドレスを狙えてしまう) */
const IP_LITERAL_RE = /^(\d{1,3}(\.\d{1,3}){3}|\[.*\])$/;

/**
 * 取りに行ってよい URL なら URL オブジェクト、だめなら null。
 * - http / https だけ。ポートは既定 (80 / 443) だけ (他のポートで動いているサービスを探られないように)
 * - ホスト名が IP アドレスそのもの・localhost・.local / .internal / .localhost で終わるもの・ドットの無い名前はだめ
 * - この Worker 自身 (selfHost) はだめ (自分の API を利用者の cookie なしで叩かせても益が無く、ループもしうる)
 * - 認証情報 (user:pass@) の入った URL はだめ
 */
export function allowedPreviewUrl(input: string, selfHost: string): URL | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.port !== "") return null;
  if (url.username !== "" || url.password !== "") return null;
  // 末尾のドット (完全修飾の書き方。localhost. は localhost と同じ場所を指す) は落としてから比べる。
  // 落とさないと、下のどの判定も「localhost.」「poi.example.」をすり抜ける
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (host === "" || !host.includes(".")) return null;
  if (IP_LITERAL_RE.test(host)) return null;
  if (/(^|\.)(localhost|local|internal)$/.test(host)) return null;
  if (host === selfHost.toLowerCase().replace(/\.+$/, "")) return null;
  return url;
}
