import { expect, type Page, test } from "@playwright/test";

import { PERSISTENCE_STORAGE_STATE } from "./global-setup";

// 本番ビルドを vp preview (本物の Worker とローカル D1) で動かして見る (playwright.config.ts の production)。
// 単体テストは API を偽物にしているので、画面で書いたものが Worker を通って D1 に残るかはここでしか確かめられない

// public/_headers の CSP (HAY-36)。ここが変わったらテストも合わせて直す
const CSP =
  "script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

/**
 * ページで起きた CSP 違反を集める。違反した読み込みや実行はブラウザが止めるだけで、画面は黙って壊れるので、
 * 何も描かれないことを見るより違反そのものを見る。
 * e2e の型にはブラウザの DOM が無いので、ページ内で動かす処理は文字列で渡す (a11y.spec.ts と同じ)
 */
async function collectCspViolations(page: Page) {
  await page.addInitScript(`
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__cspViolations.push(e.violatedDirective + " " + e.blockedURI);
    });
  `);
  return () => page.evaluate<string[]>("window.__cspViolations");
}

test("ランディングは CSP を強制した本番ビルドで違反なく表示される", async ({ page }) => {
  const violations = await collectCspViolations(page);
  const response = await page.goto("/");
  // ヘッダーが付かなくなると、違反が無いことを確かめても意味が無くなる
  expect(response?.headers()["content-security-policy"]).toBe(CSP);
  await expect(page.locator("h1").first()).toBeVisible();
  expect(await violations()).toEqual([]);
});

test.describe("ログイン済み", () => {
  test.use({ storageState: PERSISTENCE_STORAGE_STATE });

  test("板に書いた内容は保存され、読み込み直しても残っている (CSP の違反も無い)", async ({
    page,
  }) => {
    // 前の実行の内容に左右されないよう、板を空にしておく
    const before = await (await page.request.get("/api/board")).json();
    const reset = await page.request.put("/api/board", {
      data: { userId: before.userId, revision: before.revision, sections: [] },
    });
    expect(reset.ok()).toBe(true);

    const violations = await collectCspViolations(page);
    const response = await page.goto("/board");
    expect(response?.headers()["content-security-policy"]).toBe(CSP);
    await page.getByRole("button", { name: "セクションを追加" }).click();

    // 前の実行の内容と取り違えないよう、毎回違う文にする
    const text = `保存を確かめるメモ ${Date.now()}`;
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/api/board") && r.request().method() === "PUT",
    );
    // keyboard.type は CodeMirror の入力補助を通って文字が変わることがあるので、そのまま入れる
    await page.keyboard.insertText(text);
    expect((await saved).ok()).toBe(true);
    await expect(page.getByText("保存済み", { exact: true }).first()).toBeAttached();

    // 画面の外からも D1 に入ったことを確かめる
    const stored = await (await page.request.get("/api/board")).json();
    expect(stored.sections.map((s: { content: string }) => s.content)).toEqual([text]);

    // 集めた違反は読み込み直すと消えるので、その前にも見る
    expect(await violations()).toEqual([]);
    await page.reload();
    await expect(page.getByText(text)).toBeVisible();
    expect(await violations()).toEqual([]);
  });
});
