// コミットメッセージの lint (commitlint)。Conventional Commits (config-conventional) に従い、件名は日本語で書く:
// `feat(board): セクションの並べ替えを追加する` のような件名、空行を挟んで理由を書く本文、最後に Fixes HAY-N (Linear の issue) / Co-Authored-By などのトレーラー。
// subject-case は切る: 日本語の件名が README / CSP / Biome のような英字の固有名詞で始まると upper-case や sentence-case 違反になるため。
// 日本語で書くことや句点「。」は commitlint では検査できないので AGENTS.md の規約に任せる。
// .husky/commit-msg でコミット時に、CI (ci.yml) で push / PR のコミットに対して走らせる
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "subject-case": [0],
  },
};
