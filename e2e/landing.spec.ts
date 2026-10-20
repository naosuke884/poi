import { expect, test } from "@playwright/test";

// ランディングの寿命のバーの飾り (使い道の見本の LifeLineDemo)。スクロールで「あと N 日」とバーが減っていく。
// HAY-51 の食い違い (Safari で日数が出なくなる) は WebKit でしか起きず、CI の Chromium では再現しない。
// WebKit で動かせば (iPhone の devices で) このテストが落ちることは手元で確かめてある
test("寿命のバーの飾りは、スクロールの途中でも「あと N 日」とバーの長さが一致する", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator('[class*="lifeDemo_"]').first();
  await demo.scrollIntoViewIfNeeded();
  // 画面の下端から中ほどへ動かしながら、途中の何点かで比べる
  const viewportHeight = page.viewportSize()!.height;
  const seen = new Set<number>();
  for (const fraction of [0.9, 0.75, 0.6, 0.5]) {
    await page.evaluate(
      `(() => {
        const el = document.querySelector('[class*="lifeDemo_"]');
        window.scrollBy(0, el.getBoundingClientRect().top - ${viewportHeight * fraction});
      })()`,
    );
    // e2e の型にはブラウザの DOM が無いので、ページ内で動かす処理は文字列で渡す (a11y.spec.ts と同じ)
    const { days, total, ratio } = await page.evaluate<{
      days: number;
      total: number;
      ratio: number;
    }>(
      `(() => {
        const el = document.querySelector('[class*="lifeDemo_"]');
        const label = el.querySelector('[class*="lifeDemoLabel"]');
        const track = el.querySelector('[class*="lifeDemoTrack"]');
        const remaining = el.querySelector('[class*="lifeDemoRemaining"]');
        const [, n] = getComputedStyle(label).counterReset.split(" ");
        return {
          days: Number(n),
          total: Number(getComputedStyle(el).getPropertyValue("--life-demo-total")),
          ratio: remaining.getBoundingClientRect().width / track.getBoundingClientRect().width,
        };
      })()`,
    );
    expect(days).toBeGreaterThanOrEqual(1);
    expect(ratio * total).toBeCloseTo(days, 1);
    seen.add(days);
  }
  // 減っていく途中も比べられていること (全部 30 や全部 1 では確かめたことにならない)
  expect(seen.size).toBeGreaterThan(1);
});
