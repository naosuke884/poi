#!/usr/bin/env node
// Checks placement under src/ against the route-colocation rules (no dependencies).
//
//   node .claude/skills/route-colocation/scripts/check-placement.mjs            check everything
//   node .claude/skills/route-colocation/scripts/check-placement.mjs <file>...  explain those files' users and placement
//
// Checks:
//   1. Each piece's placement matches where the files importing it live (the table in SKILL.md)
//   2. No non-route .ts / .tsx sits in src/routes outside -components / -lib (it would add a URL)
//   3. Relative / @/ imports, import() and vi.mock point to existing files
//   4. src/... paths written in comments etc. exist (src, worker, shared, config files)
// Imports are resolved from how the path is written (./ ../ @/ only; extensions and index are filled in).
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

// --- Resolving imports ---

const EXTS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
function resolveSpec(from, spec) {
  let base;
  if (spec.startsWith("./") || spec.startsWith("../")) base = posix.join(posix.dirname(from), spec);
  else if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else return undefined; // packages, @shared/, etc. are out of scope
  for (const ext of EXTS) {
    const p = base + ext;
    if (existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isFile()) return p;
  }
  return null; // unresolved
}

const IMPORT_RE = [
  { re: /\bfrom\s*["']([^"']+)["']/g, kind: "import" },
  { re: /^\s*import\s*["']([^"']+)["']/gm, kind: "import" },
  { re: /\bimport\(\s*["']([^"']+)["']\s*\)/g, kind: "import()" },
  { re: /\bvi\.mock\(\s*["']([^"']+)["']/g, kind: "vi.mock" },
];

const importers = new Map(); // target → set of files importing it (vi.mock not counted)
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

// --- Classifying places ---
// A "place" is one of:
//   { kind: "route", dir }  a route directory inside src/routes (pieces go in its -components / -lib)
//   { kind: "shared" }      src/components / src/lib
//   { kind: "entry" }       directly under src/ (next to main.tsx)

const isRouteFile = (f) => {
  if (!f.startsWith("src/routes/") || !isCode(f) || isTest(f)) return false;
  if (f.split("/").some((s) => s.startsWith("-"))) return false;
  return true;
};

// The place of a file seen as a user
function userPlace(f) {
  if (f === "src/routes/__root.tsx") return { kind: "route", dir: "src/routes/(root)" };
  if (f.startsWith("src/components/") || f.startsWith("src/lib/")) return { kind: "shared" };
  if (f.startsWith("src/routes/")) {
    const segs = f.split("/");
    const dash = segs.findIndex((s) => s.startsWith("-"));
    if (dash >= 0) return { kind: "route", dir: segs.slice(0, dash).join("/") };
    // Route files: index / route map to their directory, <name>.tsx to <name>/ (it becomes <name>/index.tsx once it has pieces)
    const name = segs.at(-1).replace(/\.tsx?$/, "");
    const dir = segs.slice(0, -1).join("/");
    return { kind: "route", dir: name === "index" || name === "route" ? dir : `${dir}/${name}` };
  }
  return { kind: "entry" };
}

// Where a piece currently lives (and whether in -components or -lib)
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

// Decide where a piece belongs from its set of users
function expectedPlace(users) {
  const places = users.map(userPlace);
  if (places.some((p) => p.kind === "shared")) return { kind: "shared" }; // src/components / src/lib cannot import from routes
  const routes = places.filter((p) => p.kind === "route");
  if (routes.length === 0) return { kind: "entry" };
  if (routes.length < places.length) return { kind: "shared" }; // both main.tsx and routes
  const dir = commonDir(routes.map((p) => p.dir));
  if (dir === "src/routes" || !dir.startsWith("src/routes/")) return { kind: "shared" };
  return { kind: "route", dir };
}

const describe = (p, sub) =>
  p.kind === "shared"
    ? `src/${sub ?? "components or lib"}/`
    : p.kind === "entry"
      ? "directly under src/"
      : `${p.dir}/-${sub ?? "components or -lib"}/`;

const samePlace = (a, b) => a.kind === b.kind && (a.kind !== "route" || a.dir === b.dir);

function check(f) {
  const home = homeOf(f);
  const all = [...(importers.get(f) ?? [])];
  const users = all.filter((u) => !isTest(u));
  if (!home || isTest(f) || isRouteFile(f)) return { f, users, skip: true };
  if (/\.css$/.test(f)) {
    // CSS lives in the same folder as the component using it
    const bad = users.filter((u) => posix.dirname(u) !== posix.dirname(f));
    return {
      f,
      users,
      problem: bad.length ? `in a different folder from its users (${bad.join(", ")})` : null,
    };
  }
  if (users.length === 0) {
    if (home.kind === "entry") return { f, users, skip: true }; // main.tsx etc.
    return {
      f,
      users,
      problem: all.length ? "used only from tests" : "not imported anywhere",
    };
  }
  const want = expectedPlace(users);
  if (samePlace(home, want)) return { f, users };
  return {
    f,
    users,
    problem: `belongs in ${describe(want, home.sub)} (currently ${describe(home, home.sub)})`,
  };
}

// --- Explaining individual files ---

const args = process.argv.slice(2);
if (args.length > 0) {
  for (const a of args) {
    const f = rel(resolve(a));
    if (!srcFiles.includes(f)) {
      console.log(`${f}: not a file checked under src/`);
      continue;
    }
    const r = check(f);
    console.log(f);
    console.log(r.users.length ? "  users:" : "  users: none");
    for (const u of r.users)
      console.log(`    ${u}  (${describe(userPlace(u)).replace(/-components or -lib\/$/, "")})`);
    if (r.users.length)
      console.log(`  belongs in: ${describe(expectedPlace(r.users), homeOf(f)?.sub)}`);
    console.log(
      `  verdict: ${r.skip ? "not checked (route / test / entry)" : (r.problem ?? "OK")}`,
    );
  }
  process.exit(0);
}

// --- Checking everything ---

const problems = { placement: [], stray: [], unresolved, stale: [] };

for (const f of srcFiles) {
  const r = check(f);
  if (r.problem) problems.placement.push(`${f}: ${r.problem}`);
}

for (const f of srcFiles.filter(isRouteFile)) {
  if (f === "src/routes/__root.tsx") continue;
  const text = readFileSync(join(ROOT, f), "utf8");
  if (!/createFileRoute|createLazyFileRoute/.test(text))
    problems.stray.push(`${f}: non-route file outside -components / -lib`);
}

// src/... paths written in comments etc.
const TEXT_ROOTS = ["src", "worker", "shared"].filter((d) => existsSync(join(ROOT, d)));
const textFiles = [
  ...TEXT_ROOTS.flatMap((d) => walk(join(ROOT, d))),
  ...readdirSync(ROOT).filter(
    (n) => /\.(ts|mts|js|mjs|json|jsonc)$/.test(n) && !n.includes("lock"),
  ),
].filter((f) => /\.(tsx?|mts|m?js|jsonc?|css)$/.test(f) && !SKIP.has(f));
// src/... and the (group)/... form that omits src/routes/
const PATH_RE = /(?<![\w@/.-])(?:src\/[\w()$./-]*[\w)]|\([\w-]+\)\/[\w()$./-]*\.(?:tsx?|css)\b)/g;
for (const f of textFiles) {
  const lines = readFileSync(join(ROOT, f), "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(PATH_RE)) {
      // Strip a trailing . and closing parens outside the path (e.g. "(src/lib/x.ts)")
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
  ["Placement does not match users", problems.placement],
  ["Pieces directly in a route directory (generated as routes)", problems.stray],
  ["Unresolved import / import() / vi.mock", problems.unresolved],
  ["Paths that do not exist (in comments etc.)", problems.stale],
];
let count = 0;
for (const [title, list] of sections) {
  if (list.length === 0) continue;
  count += list.length;
  console.log(`## ${title}`);
  for (const l of list) console.log(`- ${l}`);
  console.log();
}
if (count === 0) console.log("No problems found");
process.exit(count === 0 ? 0 : 1);
