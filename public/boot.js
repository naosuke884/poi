// 最初の描画より前に済ませること (index.html の <head> で、React より先に読み込む)。
// トップの初期 HTML にはランディングの本文が入っている (landing.html。issue #157) ので、JS (React) が動くまでの間の
// 見え方をここで整える。インラインにしないのは CSP (public/_headers の script-src 'self') に引っかかるため
try {
  // この端末で前回ログインしていたら、ランディングを見せずに板へ (src/routes/(landing)/index.tsx の beforeLoad と同じ判定。
  // ホーム画面に追加した後などは Service Worker が / を返し、Worker の転送を通らない)
  if (location.pathname === "/" && localStorage.getItem("poi:session:v1")) {
    location.replace("/board" + location.search);
  }
  // Mantine の配色 (data-mantine-color-scheme) を <html> へ付ける。JS が動くまでの間もダーク配色の人にはダークで見せる。
  // 中身は Mantine の ColorSchemeScript と同じ (defaultColorScheme="auto")
  var stored = localStorage.getItem("mantine-color-scheme-value");
  var scheme = stored === "light" || stored === "dark" ? stored : "auto";
  document.documentElement.setAttribute(
    "data-mantine-color-scheme",
    scheme !== "auto"
      ? scheme
      : matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
  );
} catch (e) {}
