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
 * 出ているツールチップを消す。ツールチップは body 直下 (ランドマークの外) に描かれるので、出たまま調べると違反になる。
 * 出るのは、ポインタがボタンの上に残っているとき (押した後。押した拍子に並びが動いて、別のボタンが下に来ることもある) と、
 * キーボード操作の後にフォーカスがボタンへ戻ったとき (タグを選ぶ欄を閉じた後)。
 * keepFocus は、フォーカスを動かしたくないとき (タグを選ぶ欄は、フォーカスが外へ出ると閉じる)
 */
async function hideTooltips(page: Page, { keepFocus = false } = {}) {
  await page.mouse.move(0, 0);
  // e2e の型にはブラウザの DOM が無いので、ページ内で動かす処理は文字列で渡す
  if (!keepFocus) {
    await page.evaluate("document.activeElement?.blur()");
    // 押した拍子に並びが動いた (絞り込み・欄の開け閉め) 後は、ポインタが外れても出たままのことがあるので、
    // Esc でも消す (ツールチップは Esc で隠れる。Tooltip.tsx)
    await page.keyboard.press("Escape");
  }
  await expect(page.getByRole("tooltip")).toHaveCount(0);
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
    { name: "使い方とよくある質問", path: "/docs/guide" },
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

  /**
   * 板をまるごと置き換え、登録済みのタグも消す (前の実行の内容に左右されないように。途中で失敗した実行は、
   * 登録したタグを消さずに終わる)
   */
  async function resetBoard(page: Page, contents: string[]) {
    const board = await (await page.request.get("/api/board")).json();
    for (const { id } of board.tags as { id: string }[]) {
      expect((await page.request.delete("/api/tags", { data: { id } })).ok()).toBe(true);
    }
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
    // リンクのプレビューは、テストの中から外のサイトを取りに行かないよう、決まった返事にする
    await page.route("**/api/link-preview", (route) =>
      route.fulfill({ json: { preview: { title: "Example Domain", siteName: null } } }),
    );
    await page.goto("/board");
    await expect(page.getByText("買い物").first()).toBeVisible();
    await expect(page.getByText("Example Domain")).toBeVisible();
    await expectNoViolations(page, testInfo, "セクションのある板");

    // 編集中のセクションと、その下の書式のツールバー
    await page.getByRole("group", { name: /^セクション 3/ }).click();
    await expect(page.getByRole("toolbar", { name: "セクション 3 の書式" })).toBeVisible();
    await hideTooltips(page, { keepFocus: true });
    await expectNoViolations(page, testInfo, "書式のツールバー");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("toolbar")).toBeHidden();

    // タグを選ぶポップオーバー (新しいタグを打ったところ) と、タグの付いた状態
    const tagButton = page.getByRole("button", { name: /セクション 1 のタグを選ぶ/ });
    await tagButton.click();
    await hideTooltips(page, { keepFocus: true });
    const picker = page.getByRole("group", { name: "セクション 1 のタグを選ぶ" });
    const search = picker.getByLabel("タグを探すか、新しく作る");
    await search.fill("買い物");
    await expectNoViolations(page, testInfo, "タグを選ぶポップオーバー");
    await search.press("Enter");
    await expect(tagButton).toBeFocused();
    await hideTooltips(page);
    await expect(tagButton).toHaveAccessibleName(/^買い物 /);
    await expectNoViolations(page, testInfo, "タグの付いたセクション");

    // 登録済みのタグが並んだポップオーバーと、「…」で名前の変更・削除を開いたところ、削除の確認。
    // 最後に登録を消す
    await tagButton.click();
    await hideTooltips(page, { keepFocus: true });
    await expect(picker.getByRole("button", { name: "買い物", exact: true })).toBeVisible();
    await expectNoViolations(page, testInfo, "登録済みのタグを選ぶポップオーバー");
    await picker.getByRole("button", { name: "タグ「買い物」の名前を変える・削除する" }).click();
    await expect(picker.getByLabel("タグ「買い物」の新しい名前")).toBeFocused();
    await expectNoViolations(page, testInfo, "タグの名前を変えているところ");
    await picker.getByRole("button", { name: "削除", exact: true }).click();
    await expectNoViolations(page, testInfo, "タグの削除の確認");
    await picker.getByRole("button", { name: "削除する" }).click();
    // 削除はサーバへ送るので、済んで行ごと無くなるのを待つ
    await expect(picker.getByLabel("タグ「買い物」の新しい名前")).toBeHidden();
    await expect(picker.getByRole("button", { name: "買い物", exact: true })).toBeHidden();
    await search.press("Escape");
    await expect(tagButton).toBeFocused();
    await hideTooltips(page);

    // タグで絞り込んだ板 (上の確認で登録を消したので、ここで登録し直して選ぶ)
    await tagButton.click();
    await search.fill("買い物");
    await search.press("Enter");
    // 登録はサーバへ送るので、付くのを待ってから絞り込む
    await expect(tagButton).toHaveAccessibleName(/^買い物 /);
    await page
      .getByRole("group", { name: "タグで絞り込む" })
      .getByRole("button", { name: "買い物" })
      .click();
    await hideTooltips(page);
    await expect(page.getByText("const x = 1;")).toBeHidden();
    await expectNoViolations(page, testInfo, "タグで絞り込んだ板");
  });

  test("ユーザーメニューとダイアログ", async ({ page }, testInfo) => {
    await resetBoard(page, []);
    await page.goto("/board");
    await page.getByRole("button", { name: "A11y Check" }).click();
    // 開くときのフェードの途中だと色が背景と混ざり、コントラストが低く出るので、終わるまで待つ
    await expect(page.getByRole("menu")).toHaveCSS("opacity", "1");
    await expectNoViolations(page, testInfo, "ユーザーメニュー");

    await page.getByRole("menuitem", { name: "アカウント削除" }).click();
    await expect(page.getByRole("dialog", { name: "アカウント削除の確認" })).toHaveCSS(
      "opacity",
      "1",
    );
    await expectNoViolations(page, testInfo, "アカウント削除の確認");
  });

  // 最初の項目の強調は、キーボードで開いたときだけ出す (クリックで開いたときに出すと選んだように見える。Menu.tsx。HAY-15)
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
