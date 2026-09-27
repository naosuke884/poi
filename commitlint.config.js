// コミットメッセージの lint (commitlint)。Conventional Commits ではなく、このリポジトリの書き方に合わせる:
// 英語の命令形で大文字から始まる件名 (末尾にピリオドを付けない)、空行を挟んで理由を書く本文、
// 最後に Closes #N / Co-Authored-By などのトレーラー。
// .husky/commit-msg でコミット時に、CI (ci.yml) で push / PR のコミットに対して走らせる
export default {
  rules: {
    "header-case": [2, "always", "sentence-case"],
    "header-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100],
    "header-trim": [2, "always"],
    "body-leading-blank": [2, "always"],
    "body-max-line-length": [1, "always", 100],
  },
};
