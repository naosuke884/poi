import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import react from "@vitejs/plugin-react";
import { build, type Plugin } from "vite";

/** ランディングを HTML にしたファイル。Worker が / で返し (worker/site/pages.ts)、Service Worker も / で返す */
export const LANDING_HTML = "landing.html";

/** src/prerender.tsx の renderPages が返すページ (型は tsconfig.node の外なので import せず同じ形を書く) */
type PrerenderedPage = { file: string; markup: string; routeId: string };

/** client のビルドのチャンクのうち、ページの CSS を集めるのに要るところ */
type ChunkInfo = { moduleIds: string[]; imports: string[]; css: string[] };

/**
 * ランディングや使い方などのページ (shared/site.ts の PRERENDERED_PAGES) をビルド時に HTML にし、ビルドした
 * index.html の #root に入れて landing.html・guide.html などとして出す (issue #157)。JS を実行しないクローラーや
 * リンクのプレビューにも本文が見えるようにするため。描画は src/prerender.tsx を Node 向けに別途ビルドして行う。
 * ページのルートのチャンクの CSS も head で読み込ませる (遅延読み込みのチャンクの CSS なので、入れないと JS が動くまで
 * スタイルの無い本文が見える)。client のビルドの writeBundle で出すので、その後 (closeBundle) に動く VitePWA の
 * precache にも入る
 */
export function prerenderPages(): Plugin {
  const chunks = new Map<string, ChunkInfo>();
  return {
    name: "poi:prerender-pages",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    generateBundle(_options, bundle) {
      chunks.clear();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        chunks.set(chunk.fileName, {
          moduleIds: chunk.moduleIds,
          imports: chunk.imports,
          css: [...(chunk.viteMetadata?.importedCss ?? [])],
        });
      }
    },
    async writeBundle(options) {
      const outDir = options.dir!;
      const root = this.environment.config.root;
      const pages = await renderPages(root);
      if (!pages.some((page) => page.file === LANDING_HTML)) {
        this.error(
          `PRERENDERED_PAGES の / が ${LANDING_HTML} でない (vite.config.ts の directoryIndex と食い違う)`,
        );
      }
      const index = await readFile(path.join(outDir, "index.html"), "utf8");
      if (!index.includes('<div id="root"></div>')) this.error("index.html に空の #root が無い");
      for (const page of pages) {
        const pageCss = routeCss(chunks, page.routeId);
        if (pageCss.length === 0)
          this.error(`${page.file} のルートのチャンクの CSS が見つからない`);
        const links = pageCss
          .filter((file) => !index.includes(`/${file}"`))
          .map((file) => `<link rel="stylesheet" crossorigin href="/${file}">`)
          .join("");
        const html = index
          .replace("</head>", `${links}</head>`)
          .replace('<div id="root"></div>', `<div id="root">${page.markup}</div>`);
        await assertCssModuleClasses(this, page, outDir, [...linkedCss(index), ...pageCss]);
        await writeFile(path.join(outDir, page.file), html);
      }
    },
  };
}

/**
 * ルートのファイルのモジュールを含むチャンクから、静的に読み込むチャンクをたどって CSS を集める。
 * ルートの id が / で終わるもの ("/(landing)/") はディレクトリ全体、それ以外 ("/(docs)/guide") は
 * guide.tsx (分割されたものを含む) か guide/ の下をそのルートのファイルとみなす
 */
function routeCss(chunks: Map<string, ChunkInfo>, routeId: string): string[] {
  const base = `/src/routes${routeId}`;
  const isRouteModule = (id: string) =>
    base.endsWith("/") ? id.includes(base) : id.includes(`${base}.`) || id.includes(`${base}/`);
  const css = new Set<string>();
  const seen = new Set<string>();
  const visit = (fileName: string) => {
    const chunk = chunks.get(fileName);
    if (!chunk || seen.has(fileName)) return;
    seen.add(fileName);
    for (const file of chunk.css) css.add(file);
    for (const imported of chunk.imports) visit(imported);
  };
  for (const [fileName, chunk] of chunks) {
    if (chunk.moduleIds.some(isRouteModule)) visit(fileName);
  }
  return [...css];
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
  page: PrerenderedPage,
  outDir: string,
  cssFiles: string[],
) {
  const css = (
    await Promise.all(cssFiles.map((file) => readFile(path.join(outDir, file), "utf8")))
  ).join("");
  const classes = new Set(
    [...page.markup.matchAll(/class="([^"]*)"/g)].flatMap(([, list]) => list!.split(/\s+/)),
  );
  const missing = [...classes].filter((c) => /^_\w+_\w{5}_\d+$/.test(c) && !css.includes(`.${c}`));
  if (missing.length > 0) {
    context.error(`${page.file} のクラスが CSS に無い (クラス名の食い違い): ${missing.join(" ")}`);
  }
}

/** src/prerender.tsx を Node 向けにビルドして読み込み、各ページの HTML を得る */
async function renderPages(root: string): Promise<PrerenderedPage[]> {
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
    const { renderPages } = (await import(url)) as {
      renderPages: () => Promise<PrerenderedPage[]>;
    };
    return await renderPages();
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
