import { createRoot } from "react-dom/client";
import { App, createAppRouter } from "./app";
// ホーム画面への追加 (beforeinstallprompt) は React のマウントより先に飛んでくることがあるので、
// 受け取り口をここで先に用意しておく (副作用だけの import)
import "@/lib/install-prompt";
import { removeByPrefix } from "@/lib/local-storage";
import { pruneBoardCaches } from "@/lib/offline-caches";

// セクションの折り畳み機能は 2026-09 に廃止した (#51)。端末ごとに localStorage へ
// 記録していた頃の残りを消す (しばらく経ったらこの行ごと消してよい)
removeByPrefix("poi:collapsed:v1:");
// オフライン用の板のキャッシュから、期限を過ぎたセクションの本文を消す (issue #115)
pruneBoardCaches();

const router = createAppRouter();
const rootElement = document.getElementById("root")!;

// トップ (/) の初期 HTML には、ビルド時に描画したランディングが入っている (landing.html。issue #157)。
// その HTML はハイドレーションせず、同じものを描いて置き換える (TanStack Router は公式の SSR の仕組み以外では
// サーバーとブラウザで描く木が違い、ハイドレーションが食い違う)。表示中のルートのコード (遅延読み込みのチャンク) と
// beforeLoad を先に済ませ、最初の描画で中身まで描けるようにしておく (React は最初の描画の反映と同時に
// 入っている HTML を消すので、空の画面を挟まない)
if (rootElement.hasChildNodes()) await router.load();
createRoot(rootElement).render(<App router={router} />);
