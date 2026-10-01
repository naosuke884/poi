/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// mantine-styles.ts が、src で使っている Mantine のコンポーネントの CSS を過不足なく、
// Mantine の styles.css と同じ順で読み込んでいるかを確かめる (issue #135)。
// コンポーネントを使い始めたのに CSS を足し忘れると、見た目が崩れるだけでエラーにならないため。
//
// 必要な CSS は、使っているコンポーネントの ESM から相対 import をたどり、途中で読み込まれる
// <Name>.module.mjs (= styles/<Name>.css のクラス名) を集めて求める。Menu → Popover のような
// 内部の依存もこれで拾える

const root = resolve(import.meta.dirname, "..");
const mantineDir = join(root, "node_modules/@mantine/core");
const esmDir = join(mantineDir, "esm");

// 全コンポーネント共通の CSS (styles.css の先頭と同じ順)
const BASE_STYLES = ["baseline", "default-css-variables", "global"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path] : [];
  });
}

// src の `import { A, type B } from "@mantine/core"` から、値として使っている名前を集める
function usedMantineExports(): Set<string> {
  const names = new Set<string>();
  for (const file of sourceFiles(join(root, "src"))) {
    const code = readFileSync(file, "utf8");
    for (const m of code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"@mantine\/core"/g)) {
      if (m[0].startsWith("import type")) continue;
      for (const spec of m[1].split(",")) {
        const name = spec.trim();
        if (name && !name.startsWith("type ")) names.add(name.split(/\s+as\s+/)[0]);
      }
    }
  }
  return names;
}

const relativeImports = (code: string) =>
  [...code.matchAll(/^import\s+(?:[^"]*\s+from\s+)?"(\.[^"]+)"/gm)].map((m) => m[1]);

// エクスポート名 → それを定義している ESM ファイル (esm/index.mjs の import 文から)
function exportFiles(): Map<string, string> {
  const map = new Map<string, string>();
  const index = readFileSync(join(esmDir, "index.mjs"), "utf8");
  for (const m of index.matchAll(/^import\s+\{([^}]*)\}\s+from\s+"(\.[^"]+)"/gm)) {
    for (const spec of m[1].split(",")) {
      const local = spec.trim().split(/\s+as\s+/);
      if (local[0]) map.set(local.at(-1) as string, join(esmDir, m[2]));
    }
  }
  return map;
}

function requiredComponentStyles(): Set<string> {
  const files = exportFiles();
  const styles = new Set<string>();
  const seen = new Set<string>();
  const stack: string[] = [];
  for (const name of usedMantineExports()) {
    const file = files.get(name);
    if (!file) throw new Error(`@mantine/core の ${name} の定義が見つからない`);
    stack.push(file);
  }
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const module = /([^/]+)\.module\.mjs$/.exec(file);
    if (module) styles.add(module[1]);
    for (const spec of relativeImports(readFileSync(file, "utf8"))) {
      stack.push(resolve(dirname(file), spec));
    }
  }
  return styles;
}

// styles.css (全コンポーネント入り) の中での各ファイルの位置。依存される側が先に来る順になっている
function officialOrder(names: string[]): string[] {
  const all = readFileSync(join(mantineDir, "styles.css"), "utf8");
  const position = (name: string) => {
    // 中身そのままでは一致しないことがある (整形の違い) ので、最初のクラスの位置で比べる
    const css = readFileSync(join(mantineDir, "styles", `${name}.css`), "utf8");
    const firstClass = /\.m_[0-9a-f]+\b/.exec(css)?.[0];
    const at = firstClass ? all.indexOf(firstClass) : -1;
    if (at < 0) throw new Error(`styles.css の中に ${name}.css が見つからない`);
    return at;
  };
  return [...names].sort((a, b) => position(a) - position(b));
}

function importedStyles(): string[] {
  const code = readFileSync(join(root, "src/mantine-styles.ts"), "utf8");
  return [...code.matchAll(/^import\s+"@mantine\/core\/styles\/([^"]+)\.css";/gm)].map((m) => m[1]);
}

describe("mantine-styles.ts (issue #135)", () => {
  it("使っているコンポーネントの CSS だけを styles.css と同じ順で読み込む", () => {
    const expected = [...BASE_STYLES, ...officialOrder([...requiredComponentStyles()])];
    const lines = expected.map((n) => `import "@mantine/core/styles/${n}.css";`).join("\n");
    expect(
      importedStyles(),
      `src/mantine-styles.ts の import をこうする (${relative(root, mantineDir)}):\n${lines}\n`,
    ).toEqual(expected);
  });
});
