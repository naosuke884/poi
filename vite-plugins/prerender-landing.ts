import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import react from "@vitejs/plugin-react";
import { build, type Plugin } from "vite";

/** ランディングのルートのファイル。これを含むチャンク (と、そこから読み込むチャンク) の CSS を landing.html に入れる */
const LANDING_ROUTE_DIR = `${path.sep}src${path.sep}routes${path.sep}(landing)${path.sep}`;

/** ランディングを HTML にしたファイル。Worker が / で返し (worker/site/pages.ts)、Service Worker も / で返す */
export const LANDING_HTML = "landing.html";

/**
 * トップ (/) のランディングをビルド時に HTML にし、ビルドした index.html の #root に入れて landing.html として出す
 * (issue #157)。JS を実行しないクローラーやリンクのプレビューにも本文が見えるようにするため。
 * 描画は src/prerender.tsx を Node 向けに別途ビルドして行う。ランディングのチャンクの CSS も head で読み込ませる
 * (遅延読み込みのチャンクの CSS なので、入れないと JS が動くまでスタイルの無い本文が見える)。
 * client のビルドの writeBundle で出すので、その後 (closeBundle) に動く VitePWA の precache にも入る
 */
export function prerenderLanding(): Plugin {
  let landingCss: string[] = [];
  return {
    name: "poi:prerender-landing",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    generateBundle(_options, bundle) {
      // ランディングのルートのモジュールを含むチャンクから、静的に読み込むチャンクをたどって CSS を集める
      const css = new Set<string>();
      const seen = new Set<string>();
      const visit = (fileName: string) => {
        const chunk = bundle[fileName];
        if (chunk?.type !== "chunk" || seen.has(fileName)) return;
        seen.add(fileName);
        for (const file of chunk.viteMetadata?.importedCss ?? []) css.add(file);
        for (const imported of chunk.imports) visit(imported);
      };
      for (const chunk of Object.values(bundle)) {
        if (
          chunk.type === "chunk" &&
          chunk.moduleIds.some((id) => id.includes(LANDING_ROUTE_DIR))
        ) {
          visit(chunk.fileName);
        }
      }
      if (css.size === 0) this.error("ランディングのチャンクの CSS が見つからない");
      landingCss = [...css];
    },
    async writeBundle(options) {
      const outDir = options.dir!;
      const root = this.environment.config.root;
      const markup = await renderLandingMarkup(root);
      const index = await readFile(path.join(outDir, "index.html"), "utf8");
      const links = landingCss
        .filter((file) => !index.includes(`/${file}"`))
        .map((file) => `<link rel="stylesheet" crossorigin href="/${file}">`)
        .join("");
      if (!index.includes('<div id="root"></div>')) this.error("index.html に空の #root が無い");
      const html = index
        .replace("</head>", `${links}</head>`)
        .replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
      await assertCssModuleClasses(this, markup, outDir, [...linkedCss(index), ...landingCss]);
      await writeFile(path.join(outDir, LANDING_HTML), html);
    },
  };
}

/** HTML が読み込む CSS (dist/client からの相対パス) */
const linkedCss = (html: string) =>
  [...html.matchAll(/<link rel="stylesheet"[^>]*href="\/([^"]+)"/g)].map(([, file]) => file!);

/**
 * プリレンダーした HTML の CSS Modules のクラス名 (_heroTitle_1qte6_3 の形) が、読み込む CSS にすべてあるか。
 * 無ければ Node 向けのビルドと client のビルドでクラス名が食い違っている (JS が動くまでスタイルが効かない)
 */
async function assertCssModuleClasses(
  context: { error: (message: string) => never },
  markup: string,
  outDir: string,
  cssFiles: string[],
) {
  const css = (
    await Promise.all(cssFiles.map((file) => readFile(path.join(outDir, file), "utf8")))
  ).join("");
  const classes = new Set(
    [...markup.matchAll(/class="([^"]*)"/g)].flatMap(([, list]) => list!.split(/\s+/)),
  );
  const missing = [...classes].filter((c) => /^_\w+_\w{5}_\d+$/.test(c) && !css.includes(`.${c}`));
  if (missing.length > 0) {
    context.error(`landing.html のクラスが CSS に無い (クラス名の食い違い): ${missing.join(" ")}`);
  }
}

/** src/prerender.tsx を Node 向けにビルドして読み込み、ランディングの HTML を得る */
async function renderLandingMarkup(root: string): Promise<string> {
  // 依存パッケージ (node_modules) を読み込めるよう、リポジトリの中に出す
  const outDir = path.join(root, "node_modules/.tmp/prerender");
  try {
    await build({
      configFile: false,
      root,
      logLevel: "warn",
      // CSS Modules のクラス名は、postcss.config.cjs を含め client のビルドと同じ設定で作られる
      // (食い違っていないかは writeBundle の assertCssModuleClasses で確かめる)
      resolve: { tsconfigPaths: true },
      plugins: [react(), pwaRegisterStub()],
      build: {
        ssr: "src/prerender.tsx",
        outDir,
        emptyOutDir: true,
        rollupOptions: { output: { entryFileNames: "prerender.mjs" } },
      },
    });
    // 同じプロセスで 2 回目のビルド (watch など) をしても前回のモジュールを使い回さないよう、URL を毎回変える
    const url = `${pathToFileURL(path.join(outDir, "prerender.mjs")).href}?t=${Date.now()}`;
    const { renderLanding } = (await import(url)) as { renderLanding: () => Promise<string> };
    return await renderLanding();
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

/**
 * VitePWA の virtual:pwa-register/react の代わり (Node では Service Worker を登録しない)。
 * 更新の知らせは出ていない状態 = ブラウザの最初の描画と同じ
 */
function pwaRegisterStub(): Plugin {
  const id = "virtual:pwa-register/react";
  return {
    name: "poi:pwa-register-stub",
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load: (resolved) =>
      resolved === `\0${id}`
        ? `export function useRegisterSW() {
  return { needRefresh: [false, () => {}], offlineReady: [false, () => {}], updateServiceWorker: async () => {} };
}`
        : undefined,
  };
}
