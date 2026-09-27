#!/usr/bin/env node
// Headless browser for poi via the dev container's Playwright sidecar (PW_TEST_CONNECT_WS_ENDPOINT).
//
// The sidecar runs the browser; this side only needs the playwright-core client, and its version must
// match the server's major.minor. The client is installed on demand into ~/.cache/poi-playwright/<ver>
// (outside the repo), and the version is taken from the server's mismatch error when it changes.
// exposeNetwork "<loopback>" makes the remote browser reach this container's localhost, so
// http://localhost:5173 and cookies for "localhost" work as-is.
//
// CLI (quick screenshot):
//   node .claude/skills/verifying-in-app/scripts/pw.mjs <url> <out.png> [--state state.json] [--width 1280] [--height 800] [--full]
//
// Library (interaction scripts; import by absolute path):
//   import { openPage } from "/home/dev-container/poi/.claude/skills/verifying-in-app/scripts/pw.mjs";
//   const { page, browser } = await openPage({ storageState: "state.json" });
//   ... await browser.close();
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const CACHE = join(homedir(), ".cache", "poi-playwright");
const ENDPOINT = process.env.PW_TEST_CONNECT_WS_ENDPOINT ?? "ws://playwright:3000/";

function loadClient(version) {
  const dir = join(CACHE, version);
  if (!existsSync(join(dir, "node_modules", "playwright-core"))) {
    mkdirSync(dir, { recursive: true });
    console.error(`installing playwright-core@${version} into ${dir}`);
    execFileSync(
      "npm",
      ["install", "--prefix", dir, "--no-save", "--silent", `playwright-core@${version}`],
      {
        stdio: ["ignore", "ignore", "inherit"],
      },
    );
  }
  return createRequire(join(dir, "index.js"))("playwright-core");
}

async function connect() {
  const installed = existsSync(CACHE) ? readdirSync(CACHE).sort().reverse() : [];
  let version = installed[0] ?? "1.62";
  for (let attempt = 0; attempt < 2; attempt++) {
    const { chromium } = loadClient(version);
    try {
      return await chromium.connect(ENDPOINT, { exposeNetwork: "<loopback>" });
    } catch (e) {
      const server = String(e.message).match(/server version: v(\d+\.\d+)/)?.[1];
      if (!server || server === version) throw e;
      version = server; // retry once with the server's version
    }
  }
  throw new Error("could not connect to the Playwright server");
}

export async function openPage({
  storageState,
  viewport = { width: 1280, height: 800 },
  ...contextOptions
} = {}) {
  const browser = await connect();
  const context = await browser.newContext({
    storageState,
    viewport,
    locale: "ja-JP",
    ...contextOptions,
  });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error(`[console.error] ${msg.text()}`);
  });
  return { browser, context, page };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      state: { type: "string" },
      width: { type: "string", default: "1280" },
      height: { type: "string", default: "800" },
      full: { type: "boolean", default: false },
    },
  });
  const [url, out] = positionals;
  if (!url || !out) {
    console.error(
      "usage: pw.mjs <url> <out.png> [--state state.json] [--width N] [--height N] [--full]",
    );
    process.exit(2);
  }
  const { browser, page } = await openPage({
    storageState: values.state,
    viewport: { width: Number(values.width), height: Number(values.height) },
  });
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.screenshot({ path: out, fullPage: values.full });
    console.error(`saved ${out} (${page.url()})`);
  } finally {
    await browser.close();
  }
}
