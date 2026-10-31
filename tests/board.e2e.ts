import { beforeEach, describe, test } from "@e2e-dev/web";
import { expect } from "e2e";

describe("板", { session: "user" }, () => {
  // 前の実行の内容に左右されないよう、板を空にしておく (e2e/production.spec.ts と同じやり方)
  beforeEach(async ({ app, browser }) => {
    const cookie = (await browser.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
    const board = new URL("/api/board", app.baseUrl);
    const before = (await (await fetch(board, { headers: { cookie } })).json()) as {
      userId: string;
      revision: number;
    };
    const reset = await fetch(board, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ userId: before.userId, revision: before.revision, sections: [] }),
    });
    expect(reset.ok).toBe(true);
  });

  test("セクションを追加して書いたメモは、開き直しても残っている", async ({
    app,
    browser,
    screen,
  }) => {
    await app.open("/board");
    await screen.getByRole("button", "セクションを追加").tap();
    // 前の実行の内容と取り違えないよう、毎回違う文にする
    const text = `手で書くメモ ${Date.now()}`;
    await browser.keyboard.type(text);
    await expect(screen.getByText("保存済み", { exact: true }).first()).toBeVisible();

    await app.open("/board");
    await expect(screen.getByText(text)).toBeVisible();
  });

  test(
    "AI に頼んで新しいセクションに書かせたメモも、開き直すと残っている",
    { tags: ["agent"] },
    async ({ app, agent, screen }) => {
      await app.open("/board");
      const text = `AI が書くメモ ${Date.now()}`;
      await agent.act("新しいセクションを追加して、{text} と書く", { params: { text } });
      await expect(screen.getByText(text)).toBeVisible();
      await expect(screen.getByText("保存済み", { exact: true }).first()).toBeVisible();

      await app.open("/board");
      await expect(screen.getByText(text)).toBeVisible();
    },
  );
});
