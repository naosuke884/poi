import { readdirSync, readFileSync } from "node:fs";
import { test as base } from "vitest";
import { getPlatformProxy } from "wrangler";

/** drizzle/ の migration をファイル名の順にすべて流す */
async function applyMigrations(db: D1Database) {
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const statements = readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint");
    await db.batch(statements.map((s) => db.prepare(s)));
  }
}

/**
 * `db` を使うテストごとに、migration だけ流した空のローカル D1 (wrangler の getPlatformProxy。workerd の SQLite で、
 * 1 文あたりのバインド数 100 などの上限も本番と同じくかかる) を立て、テストが終わったら捨てる。
 * ファイルで 1 つを共有して beforeEach で消す形だと、消し忘れた表の行が次のテストに残り、テストの順で結果が変わる。
 * 立てて migration を流すのは 1 回 0.3 秒ほど
 */
// biome-ignore lint/correctness/noEmptyPattern: Vitest はフィクスチャの依存を第 1 引数の分割代入から読むので、依存が無くても {} が要る
export const test = base.extend("db", async ({}, { onCleanup }) => {
  const proxy = await getPlatformProxy<Env>({ persist: false });
  onCleanup(() => proxy.dispose());
  await applyMigrations(proxy.env.DB);
  return proxy.env.DB;
});
