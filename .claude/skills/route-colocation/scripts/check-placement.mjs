#!/usr/bin/env node
// route-colocation の規則に照らして src/ の置き場所を検査する (依存なし)。
//
//   node .claude/skills/route-colocation/scripts/check-placement.mjs            全体を検査
//   node .claude/skills/route-colocation/scripts/check-placement.mjs <file>...  そのファイルの使う側と置き場所を説明
//
// 検査すること:
//   1. 部品の置き場所が、それを import しているファイルの場所と合っているか (SKILL.md の表)
//   2. src/routes の -components / -lib の外に、ルートでない .ts / .tsx が置かれていないか (URL が増える)
//   3. 相対パス / @/ の import・import()・vi.mock が存在するファイルを指しているか
//   4. コメントなどに書かれた src/... のパスが存在するか (src, worker, shared, 設定ファイル)
// import はパスの書き方から解決する (./ ../ @/ のみ。拡張子と index は補う)。
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const rel = (p) => relative(ROOT, p).split("\\").join("/");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(rel(p));
  }
  return out;
}

const SKIP = new Set(["src/routeTree.gen.ts", "src/vite-env.d.ts"]);
const srcFiles = walk(join(ROOT, "src")).filter((f) => /\.(tsx?|css)$/.test(f) && !SKIP.has(f));
const isTest = (f) => /\.test\.tsx?$/.test(f);
const isCode = (f) => /\.tsx?$/.test(f);

// --- import の解決 ---

const EXTS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
function resolveSpec(from, spec) {
  let base;
  if (spec.startsWith("./") || spec.startsWith("../")) base = posix.join(posix.dirname(from), spec);
  else if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else return undefined; // パッケージや @shared/ などは対象外
  for (const ext of EXTS) {
    const p = base + ext;
    if (existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isFile()) return p;
  }
  return null; // 解決できない
}

const IMPORT_RE = [
  { re: /\bfrom\s*["']([^"']+)["']/g, kind: "import" },
  { re: /^\s*import\s*["']([^"']+)["']/gm, kind: "import" },
  { re: /\bimport\(\s*["']([^"']+)["']\s*\)/g, kind: "import()" },
  { re: /\bvi\.mock\(\s*["']([^"']+)["']/g, kind: "vi.mock" },
];

const importers = new Map(); // 対象 → import しているファイルの集合 (vi.mock は数えない)
const unresolved = [];
for (const f of srcFiles.filter(isCode)) {
  const text = readFileSync(join(ROOT, f), "utf8");
  for (const { re, kind } of IMPORT_RE) {
    for (const m of text.matchAll(re)) {
      const target = resolveSpec(f, m[1]);
      if (target === undefined) continue;
      if (target === null) {
        unresolved.push(`${f}: ${kind}("${m[1]}")`);
        continue;
      }
      if (kind === "vi.mock") continue;
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target).add(f);
    }
  }
}

// --- 場所の分類 ---
// 「場所」は次のどれか:
//   { kind: "route", dir }  src/routes の中のルートのディレクトリ (部品はその -components / -lib へ)
//   { kind: "shared" }      src/components / src/lib
//   { kind: "entry" }       src/ 直下 (main.tsx の隣)

const isRouteFile = (f) => {
  if (!f.startsWith("src/routes/") || !isCode(f) || isTest(f)) return false;
  if (f.split("/").some((s) => s.startsWith("-"))) return false;
  return true;
};

// そのファイルを「使う側」として見たときの場所
function userPlace(f) {
  if (f === "src/routes/__root.tsx") return { kind: "route", dir: "src/routes/(root)" };
  if (f.startsWith("src/components/") || f.startsWith("src/lib/")) return { kind: "shared" };
  if (f.startsWith("src/routes/")) {
    const segs = f.split("/");
    const dash = segs.findIndex((s) => s.startsWith("-"));
    if (dash >= 0) return { kind: "route", dir: segs.slice(0, dash).join("/") };
    // ルートのファイル: index / route はそのディレクトリ、<name>.tsx は <name>/ (部品を持つなら <name>/index.tsx になる)
    const name = segs.at(-1).replace(/\.tsx?$/, "");
    const dir = segs.slice(0, -1).join("/");
    return { kind: "route", dir: name === "index" || name === "route" ? dir : `${dir}/${name}` };
  }
  return { kind: "entry" };
}

// 部品が今置かれている場所 (と -components / -lib のどちらか)
function homeOf(f) {
  if (f.startsWith("src/components/")) return { kind: "shared", sub: "components" };
  if (f.startsWith("src/lib/")) return { kind: "shared", sub: "lib" };
  if (f.startsWith("src/routes/")) {
    const segs = f.split("/");
    const dash = segs.findIndex((s) => s === "-components" || s === "-lib");
    if (dash < 0) return null;
    return { kind: "route", dir: segs.slice(0, dash).join("/"), sub: segs[dash].slice(1) };
  }
  if (!f.slice(4).includes("/")) return { kind: "entry" };
  return null;
}

function commonDir(dirs) {
  const parts = dirs.map((d) => d.split("/"));
  const out = [];
  for (let i = 0; parts.every((p) => i < p.length && p[i] === parts[0][i]); i++)
    out.push(parts[0][i]);
  return out.join("/");
}

// 使う側の集合から、置くべき場所を決める
function expectedPlace(users) {
  const places = users.map(userPlace);
  if (places.some((p) => p.kind === "shared")) return { kind: "shared" }; // src/components・src/lib からはルートを import できない
  const routes = places.filter((p) => p.kind === "route");
  if (routes.length === 0) return { kind: "entry" };
  if (routes.length < places.length) return { kind: "shared" }; // main.tsx とルートの両方
  const dir = commonDir(routes.map((p) => p.dir));
  if (dir === "src/routes" || !dir.startsWith("src/routes/")) return { kind: "shared" };
  return { kind: "route", dir };
}

const describe = (p, sub) =>
  p.kind === "shared"
    ? `src/${sub ?? "components か lib"}/`
    : p.kind === "entry"
      ? "src/ 直下"
      : `${p.dir}/-${sub ?? "components か -lib"}/`;

const samePlace = (a, b) => a.kind === b.kind && (a.kind !== "route" || a.dir === b.dir);

function check(f) {
  const home = homeOf(f);
  const all = [...(importers.get(f) ?? [])];
  const users = all.filter((u) => !isTest(u));
  if (!home || isTest(f) || isRouteFile(f)) return { f, users, skip: true };
  if (/\.css$/.test(f)) {
    // CSS は使うコンポーネントと同じフォルダ
    const bad = users.filter((u) => posix.dirname(u) !== posix.dirname(f));
    return {
      f,
      users,
      problem: bad.length ? `使うファイルと別のフォルダにある (${bad.join(", ")})` : null,
    };
  }
  if (users.length === 0) {
    if (home.kind === "entry") return { f, users, skip: true }; // main.tsx など
    return {
      f,
      users,
      problem: all.length ? "テストからしか使われていない" : "どこからも import されていない",
    };
  }
  const want = expectedPlace(users);
  if (samePlace(home, want)) return { f, users };
  return {
    f,
    users,
    problem: `${describe(want, home.sub)} に置くもの (今は ${describe(home, home.sub)})`,
  };
}

// --- 個別のファイルの説明 ---

const args = process.argv.slice(2);
if (args.length > 0) {
  for (const a of args) {
    const f = rel(resolve(a));
    if (!srcFiles.includes(f)) {
      console.log(`${f}: src/ の検査対象のファイルではない`);
      continue;
    }
    const r = check(f);
    console.log(f);
    console.log(r.users.length ? "  使う側:" : "  使う側: なし");
    for (const u of r.users)
      console.log(`    ${u}  (${describe(userPlace(u)).replace(/-components か -lib\/$/, "")})`);
    if (r.users.length)
      console.log(`  置き場所: ${describe(expectedPlace(r.users), homeOf(f)?.sub)}`);
    console.log(`  判定: ${r.skip ? "対象外 (ルート / テスト / エントリ)" : (r.problem ?? "OK")}`);
  }
  process.exit(0);
}

// --- 全体の検査 ---

const problems = { placement: [], stray: [], unresolved, stale: [] };

for (const f of srcFiles) {
  const r = check(f);
  if (r.problem) problems.placement.push(`${f}: ${r.problem}`);
}

for (const f of srcFiles.filter(isRouteFile)) {
  if (f === "src/routes/__root.tsx") continue;
  const text = readFileSync(join(ROOT, f), "utf8");
  if (!/createFileRoute|createLazyFileRoute/.test(text))
    problems.stray.push(`${f}: ルートでないファイルが -components / -lib の外にある`);
}

// コメントなどに書かれた src/... のパス
const TEXT_ROOTS = ["src", "worker", "shared"].filter((d) => existsSync(join(ROOT, d)));
const textFiles = [
  ...TEXT_ROOTS.flatMap((d) => walk(join(ROOT, d))),
  ...readdirSync(ROOT).filter(
    (n) => /\.(ts|mts|js|mjs|json|jsonc)$/.test(n) && !n.includes("lock"),
  ),
].filter((f) => /\.(tsx?|mts|m?js|jsonc?|css)$/.test(f) && !SKIP.has(f));
// src/... と、src/routes/ を省いた (group)/... の書き方
const PATH_RE = /(?<![\w@/.-])(?:src\/[\w()$./-]*[\w)]|\([\w-]+\)\/[\w()$./-]*\.(?:tsx?|css)\b)/g;
for (const f of textFiles) {
  const lines = readFileSync(join(ROOT, f), "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(PATH_RE)) {
      // 文末の . と、パスの外の閉じ括弧 ("(src/lib/x.ts)" など) を外す
      let p = m[0];
      const count = (s, c) => s.split(c).length - 1;
      while (/[.)]$/.test(p) && (p.endsWith(".") || count(p, ")") > count(p, "(")))
        p = p.slice(0, -1);
      if (p.includes("*")) continue;
      if (p.startsWith("(")) p = `src/routes/${p}`;
      const candidates = [p, ...EXTS.slice(1).map((e) => p + e)];
      if (!candidates.some((c) => existsSync(join(ROOT, c))))
        problems.stale.push(`${f}:${i + 1}: ${p}`);
    }
  });
}

const sections = [
  ["置き場所が使う側と合っていない", problems.placement],
  ["ルートのディレクトリ直下に置かれた部品 (ルートとして生成される)", problems.stray],
  ["解決できない import / import() / vi.mock", problems.unresolved],
  ["存在しないパスを書いている箇所 (コメントなど)", problems.stale],
];
let count = 0;
for (const [title, list] of sections) {
  if (list.length === 0) continue;
  count += list.length;
  console.log(`## ${title}`);
  for (const l of list) console.log(`- ${l}`);
  console.log();
}
if (count === 0) console.log("問題なし");
process.exit(count === 0 ? 0 : 1);
