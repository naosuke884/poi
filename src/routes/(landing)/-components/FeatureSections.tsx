import { useFigureSequence } from "../-lib/use-figure-sequence";
import { DevicesFigure, ExpiryFigure, TagFilterFigure } from "./FeatureFigures";

import classes from "./Landing.module.css";

// 特徴。見出しは「何ができるか」を短く言い切るだけにし、中身は図の動きで見せる (説明の文は置かない)。
// 日数はヒーローの見出しにあるので、ここでは繰り返さない。
// 実装の言葉 (PWA 等) は避け、細かい決まり (Markdown、オフライン、タグの上限) は使い方とよくある質問のページに任せる (HAY-53)。
// ヒーローの言い換えにならないよう、消え方の中身・絞り込み・どこからでも開けることの順に並べる
const FEATURES = [
  { id: "feature-expiry", title: "ひとつずつ消える", Figure: ExpiryFigure },
  { id: "feature-tags", title: "タグで絞り込める", Figure: TagFilterFigure },
  { id: "feature-devices", title: "どの端末でも開ける", Figure: DevicesFigure },
];

/** 特徴を一つずつ節にする。見出しの下に、それが起きるところを見せる図を置く (図は上から順に動く) */
export function FeatureSections() {
  const turns = useFigureSequence(FEATURES.length);
  return FEATURES.map(({ id, title, Figure }, index) => (
    <section key={id} aria-labelledby={id} className={classes.feature}>
      <h2 id={id} className={classes.sectionTitle}>
        {title}
      </h2>
      <Figure turn={turns[index]} />
    </section>
  ));
}
