#!/usr/bin/env bash
# public/demo.mp4 を GitHub user-attachments にアップロードし、README.md に埋め込んだ
# デモ動画の URL を差し替える。既に一致していれば何もしない。
# アップロードには gh でログイン済みのユーザーのトークンが必要
# (Actions の GITHUB_TOKEN ではこのエンドポイントが 404 になるため CI では実行できない)。
# 差し替え後の README.md のコミットは手動で行う。
set -euo pipefail

cd "$(dirname "$0")/.."

url_pattern='https://github\.com/user-attachments/assets/[0-9a-f-]+'
old_url=$(grep -oE "$url_pattern" README.md | head -n1 || true)
if [[ -z "$old_url" ]]; then
  echo "README.md に https://github.com/user-attachments/assets/... 形式の動画 URL が見つかりません" >&2
  exit 1
fi

tmp=$(mktemp)
comment_id=
cleanup() {
  rm -f "$tmp"
  if [[ -n "$comment_id" ]]; then
    gh api -X DELETE "repos/{owner}/{repo}/issues/comments/$comment_id" >/dev/null
  fi
}
trap cleanup EXIT

local_hash=$(sha256sum public/demo.mp4 | cut -d' ' -f1)
# 既存 URL が取得できない場合も、一致していないものとしてアップロードに進む
if curl -sSfL --retry 3 -o "$tmp" "$old_url" 2>/dev/null && [[ "$(sha256sum "$tmp" | cut -d' ' -f1)" == "$local_hash" ]]; then
  echo "OK: README の埋め込み動画と public/demo.mp4 は既に一致しています (sha256: $local_hash)"
  exit 0
fi

# gh issue comment --attach が内部で使うのと同じエンドポイント
repo_id=$(gh api 'repos/{owner}/{repo}' --jq .id)
new_url=$(gh api -X POST \
  "https://uploads.github.com/user-attachments/assets?content_type=video%2Fmp4&name=demo.mp4&repository_id=$repo_id" \
  -H 'Content-Type: video/mp4' --input public/demo.mp4 --jq .url)
if ! [[ "$new_url" =~ ^$url_pattern$ ]]; then
  echo "アップロード結果の URL が想定外の形式です: $new_url" >&2
  exit 1
fi

# アップロードしただけの asset は 404 のままで、issue コメントの本文に含めて投稿すると
# 数秒後に公開される。公開後はコメントを消しても残るので、確認できたら消す。
issue=$(gh issue list --state all --limit 1 --json number --jq '.[0].number')
comment_id=$(gh api "repos/{owner}/{repo}/issues/$issue/comments" \
  -f body="demo.mp4 upload for README (deleted automatically)"$'\n\n'"$new_url" --jq .id)
for _ in $(seq 30); do
  if curl -sSfL -o "$tmp" "$new_url" 2>/dev/null; then
    break
  fi
  sleep 2
done
gh api -X DELETE "repos/{owner}/{repo}/issues/comments/$comment_id" >/dev/null
comment_id=

if [[ "$(sha256sum "$tmp" | cut -d' ' -f1)" != "$local_hash" ]]; then
  echo "アップロードした動画を取得できないか、public/demo.mp4 と一致しません: $new_url" >&2
  exit 1
fi

sed -i "s|$old_url|$new_url|" README.md
echo "README.md の動画 URL を差し替えました: $old_url -> $new_url"
echo "README.md をコミットしてください"
