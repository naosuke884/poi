// コミットメッセージの lint (commitlint)。Conventional Commits ではなく、このリポジトリの書き方に合わせる:
// 日本語の件名 (末尾に句点を付けない)、空行を挟んで理由を書く本文、最後に Closes #N / Co-Authored-By などのトレーラー。
// header-case は使わない: 件名が useBoard のような小文字始まりの識別子で始まると sentence-case 違反になるため。
// 日本語で書くことや句点「。」は commitlint では検査できないので AGENTS.md の規約に任せる。
// .husky/commit-msg でコミット時に、CI (ci.yml) で push / PR のコミットに対して走らせる
export default {
  rules: {
    "header-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100],
    "header-trim": [2, "always"],
    "body-leading-blank": [2, "always"],
    "body-max-line-length": [1, "always", 100],
  },
};
