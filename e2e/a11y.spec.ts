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

/**
 * ランディングの動きが落ち着くのを待つ。見出しの「消える」が一度消えて戻る途中や、
 * スクロールで浮かび上がる特徴が半透明の間は、コントラストが実際より低く出る。
 * 時間で進む動きは終わるまで待ち、スクロールで進む動きは末尾まで送って最後の状態にする
 */
async function settleLandingMotion(page: Page) {
  // e2e の型にはブラウザの DOM が無いので、ページ内で動かす処理は文字列で渡す
  await page.evaluate(`(async () => {
    // 途中で取り消された動き (finished が reject される) は飛ばし、新しく始まった動きも待つ
    for (;;) {
      const running = document.getAnimations()
        .filter((a) => a.timeline === document.timeline && a.playState === "running")
        // 回り続ける動き (読み込み中のスピナーなど) は終わらないので待たない
        .filter((a) => a.effect?.getTiming().iterations !== Infinity);
      if (running.length === 0) break;
      await Promise.all(running.map((a) => a.finished.catch(() => {})));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    // スクロールの後の描画を待つ
    await new Promise((r) => requestAnimationFrame(r));
  })()`);
}

// Safari は子要素のあるボタンをタップすると、開いたメニューの最初の項目に :focus-visible を付ける
// (WebKit 241408)。Chromium では再現しないので、疑似クラスを強制して同じ状態を作る (HAY-15)
async function forceFocusVisible(page: Page) {
  const session = await page.context().newCDPSession(page);
  await session.send("DOM.enable");
  await session.send("CSS.enable");
  const { root } = await session.send("DOM.getDocument");
  const { nodeId } = await session.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: '[role="menu"] [role="menuitem"]',
  });
  await session.send("CSS.forcePseudoState", {
    nodeId,
    forcedPseudoClasses: ["focus", "focus-visible"],
  });
  return session;
}

test.describe("未ログイン", () => {
  for (const { name, path } of [
    { name: "ランディング", path: "/" },
    { name: "使い方", path: "/guide" },
    { name: "よくある質問", path: "/faq" },
    { name: "利用規約", path: "/terms" },
    { name: "プライバシーポリシー", path: "/privacy" },
    { name: "404", path: "/no-such-page" },
  ]) {
    test(name, async ({ page }, testInfo) => {
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeAttached();
      if (path === "/") await settleLandingMotion(page);
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
    await page.goto("/board");
    await expect(page.getByRole("button", { name: "セクションを追加" })).toBeVisible();
    await expectNoViolations(page, testInfo, "空の板");
  });

  test("セクションのある板", async ({ page }, testInfo) => {
    await resetBoard(page, [
      "# 買い物\n- 牛乳\n- [ ] 卵\n- [x] パン",
      "## メモ\n**太字** と `code` と [リンク](https://example.com)\n\n> 引用",
      "```\nconst x = 1;\n```",
    ]);
    await page.goto("/board");
    await expect(page.getByText("買い物").first()).toBeVisible();
    await expectNoViolations(page, testInfo, "セクションのある板");

    // 見出しごとのまとめ表示
    // SegmentedControl の radio は見えない input なので、クリックのイベントを直接送る
    await page.getByRole("radio", { name: /まとめ/ }).dispatchEvent("click");
    await expect(page.getByRole("radio", { name: /まとめ/ })).toBeChecked();
    await expectNoViolations(page, testInfo, "まとめ表示");
  });

  test("ユーザーメニューとダイアログ", async ({ page }, testInfo) => {
    await resetBoard(page, []);
    await page.goto("/board");
    await page.getByRole("button", { name: "A11y Check" }).click();
    // 開くときのフェードの途中だと色が背景と混ざり、コントラストが低く出るので、終わるまで待つ
    await expect(page.getByRole("menu")).toHaveCSS("opacity", "1");
    await expectNoViolations(page, testInfo, "ユーザーメニュー");

    await page.getByRole("menuitem", { name: "保存期間の設定" }).click();
    await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
    await expectNoViolations(page, testInfo, "保存期間の設定");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("button", { name: "A11y Check" }).click();
    await page.getByRole("menuitem", { name: "アカウント削除" }).click();
    await expect(page.getByRole("dialog", { name: "アカウント削除の確認" })).toHaveCSS(
      "opacity",
      "1",
    );
    await expectNoViolations(page, testInfo, "アカウント削除の確認");
  });

  // 開いた直後のフォーカスは最初の項目に置く (withInitialFocusPlaceholder={false}。UserMenu.tsx) が、
  // その印はキーボードで開いたときだけ出す (HAY-15)
  test("ユーザーメニューはクリックで開くと項目を強調せず、キーボードで開くと最初の項目を強調する", async ({
    page,
  }) => {
    await resetBoard(page, []);
    await page.goto("/board");
    const target = page.getByRole("button", { name: "A11y Check" });
    const firstItem = page.getByRole("menuitem", { name: "アカウントを追加" });

    await target.click();
    await expect(page.getByRole("menu")).toHaveCSS("opacity", "1");
    await expect(firstItem).toBeFocused();
    await expect(firstItem).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const session = await forceFocusVisible(page);
    await expect(firstItem).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(firstItem).toHaveCSS("outline-style", "none");
    await session.detach();

    await page.keyboard.press("ArrowDown");
    const moved = page.locator("[role=menuitem]:focus");
    await expect(moved).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await target.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toHaveCSS("opacity", "1");
    await expect(firstItem).toBeFocused();
    await expect(firstItem).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(firstItem).not.toHaveCSS("outline-style", "none");
  });
});
