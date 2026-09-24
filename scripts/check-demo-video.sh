#!/usr/bin/env bash
# README.md に埋め込んだデモ動画 (GitHub user-attachments) と public/demo.mp4 の内容が
# 一致していることを検証する。
# user-attachments へのアップロードは Actions の GITHUB_TOKEN では行えないため CI では同期しない。
# ズレていたらエラーで落として、手元で scripts/sync-demo-video.sh を実行するよう促す。
set -euo pipefail

cd "$(dirname "$0")/.."

url=$(grep -oE 'https://github\.com/user-attachments/assets/[0-9a-f-]+' README.md | head -n1 || true)
if [[ -z "$url" ]]; then
  echo "::error file=README.md::README.md に https://github.com/user-attachments/assets/... 形式の動画 URL が見つかりません" >&2
  exit 1
fi

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
curl -sSfL --retry 3 -o "$tmp" "$url"

local_hash=$(sha256sum public/demo.mp4 | cut -d' ' -f1)
remote_hash=$(sha256sum "$tmp" | cut -d' ' -f1)

if [[ "$local_hash" != "$remote_hash" ]]; then
  {
    echo "::error file=README.md::public/demo.mp4 と README の埋め込み動画が一致しません"
    echo ""
    echo "public/demo.mp4       sha256: $local_hash"
    echo "README の埋め込み動画 sha256: $remote_hash"
    echo ""
    echo "直し方: 手元で (gh にログインした状態で) 次を実行し、差し替わった README.md をコミットする"
    echo "  ./scripts/sync-demo-video.sh"
  } >&2
  exit 1
fi

echo "OK: README の埋め込み動画と public/demo.mp4 は一致しています (sha256: $local_hash)"
