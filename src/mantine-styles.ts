// Mantine の CSS は、使っているコンポーネントの分だけ読み込む (丸ごとの styles.css は 232 kB あり、
// 描画をブロックする。issue #135)。順番は styles.css と同じにする (依存される側が先)。
// @mantine/core のコンポーネントを使い始めたら、ここにも足す。足し忘れは mantine-styles.test.ts が
// 落ちて、貼り付ける import の一覧を出す
import "@mantine/core/styles/baseline.css";
import "@mantine/core/styles/default-css-variables.css";
import "@mantine/core/styles/global.css";
