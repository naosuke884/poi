import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { STORAGE_STATE } from "./global-setup";

// 検査する基準: WCAG 2.2 AA までと axe のベストプラクティス
const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
  "best-practice",
];

/** 今描画されているページを axe で調べ、違反があれば一覧を出して落とす (結果の JSON はレポートに添付する) */
async function expectNoViolations(page: Page, testInfo: TestInfo, name: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  await testInfo.attach(`axe-${name}.json`, {
    body: JSON.stringify(violations, null, 2),
    contentType: "application/json",
  });
  const summary = violations.map((v) => ({
    rule: `${v.id} (${v.impact}): ${v.help}`,
    url: v.helpUrl,
    nodes: v.nodes.map((n) => `${n.target.join(" ")} — ${n.failureSummary?.replace(/\s+/g, " ")}`),
  }));
  expect(summary, `${name} にアクセシビリティ違反があります`).toEqual([]);
}

test.describe("未ログイン", () => {
  for (const { name, path } of [
    { name: "ランディング", path: "/" },
    { name: "利用規約", path: "/terms" },
    { name: "プライバシーポリシー", path: "/privacy" },
    { name: "404", path: "/no-such-page" },
  ]) {
    test(name, async ({ page }, testInfo) => {
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeAttached();
      await expectNoViolations(page, testInfo, name);
    });
  }
});

test.describe("ログイン済み (板)", () => {
  test.use({ storageState: STORAGE_STATE });

  /** 板をまるごと置き換える (前の実行の内容に左右されないように) */
  async function resetBoard(page: Page, contents: string[]) {
    const board = await (await page.request.get("/api/board")).json();
    const res = await page.request.put("/api/board", {
      data: {
        userId: board.userId,
        revision: board.revision,
        sections: contents.map((content) => ({ id: null, content })),
      },
    });
    expect(res.ok()).toBe(true);
  }

  test("空の板", async ({ page }, testInfo) => {
    await resetBoard(page, []);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "セクションを追加" })).toBeVisible();
    await expectNoViolations(page, testInfo, "空の板");
  });

  test("セクションのある板", async ({ page }, testInfo) => {
    await resetBoard(page, [
      "# 買い物\n- 牛乳\n- [ ] 卵\n- [x] パン",
      "## メモ\n**太字** と `code` と [リンク](https://example.com)\n\n> 引用",
      "```\nconst x = 1;\n```",
    ]);
    await page.goto("/");
    await expect(page.getByText("買い物").first()).toBeVisible();
    await expectNoViolations(page, testInfo, "セクションのある板");

    // 見出しごとのまとめ表示
    await page.getByText("まとめ (見出しごとにまとめた表示)").click();
    await expect(page.getByRole("radio", { name: /まとめ/ })).toBeChecked();
    await expectNoViolations(page, testInfo, "まとめ表示");
  });

  test("ユーザーメニューと保存期間の設定", async ({ page }, testInfo) => {
    await resetBoard(page, []);
    await page.goto("/");
    await page.getByRole("button", { name: "A11y Check" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expectNoViolations(page, testInfo, "ユーザーメニュー");

    await page.getByRole("menuitem", { name: "保存期間の設定" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoViolations(page, testInfo, "保存期間の設定");
  });
});
