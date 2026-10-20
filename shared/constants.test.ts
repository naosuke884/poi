import { describe, expect, it } from "vite-plus/test";

import { DAY_MS, retimedExpiresAt } from "./constants";

describe("retimedExpiresAt", () => {
  const changedAt = new Date("2026-10-20T00:00:00.000Z");
  const at = (ms: number) => new Date(changedAt.getTime() + ms);

  it("作成日 + 新しい日数がまだ先なら、その日時を新しい期限にする", () => {
    // 30 日 → 7 日 (短く): 3 日前に書いたもの
    expect(retimedExpiresAt(at(-3 * DAY_MS), at(27 * DAY_MS), 7, changedAt)).toEqual(
      at(4 * DAY_MS),
    );
    // 7 日 → 30 日 (長く): 20 日前に書き、短くして残り 2 日になっていたもの
    expect(retimedExpiresAt(at(-20 * DAY_MS), at(2 * DAY_MS), 30, changedAt)).toEqual(
      at(10 * DAY_MS),
    );
  });

  it("作成日 + 新しい日数をもう過ぎていれば、変えた時点 + 新しい日数にする (今の期限の方が遅いとき)", () => {
    // 30 日 → 7 日: 10 日前に書き、残り 20 日だったもの
    expect(retimedExpiresAt(at(-10 * DAY_MS), at(20 * DAY_MS), 7, changedAt)).toEqual(
      at(7 * DAY_MS),
    );
  });

  it("作成日 + 新しい日数をもう過ぎていても、今の期限の方が早ければ延ばさない", () => {
    // 30 日 → 7 日: 29 日前に書き、残り 1 日だったもの
    expect(retimedExpiresAt(at(-29 * DAY_MS), at(DAY_MS), 7, changedAt)).toEqual(at(DAY_MS));
    // 7 日 → 30 日: 40 日前に書き、短くして残り 2 日になっていたもの (延ばしても作成日からはもう過ぎている)
    expect(retimedExpiresAt(at(-40 * DAY_MS), at(2 * DAY_MS), 30, changedAt)).toEqual(
      at(2 * DAY_MS),
    );
  });

  it("今の期限と変えた時点 + 新しい日数の、早い方を取る (同じならその日時)", () => {
    const expiresAt = at(7 * DAY_MS);
    expect(retimedExpiresAt(at(-10 * DAY_MS), at(7 * DAY_MS - 1), 7, changedAt)).toEqual(
      at(7 * DAY_MS - 1),
    );
    expect(retimedExpiresAt(at(-10 * DAY_MS), expiresAt, 7, changedAt)).toEqual(expiresAt);
    expect(retimedExpiresAt(at(-10 * DAY_MS), at(7 * DAY_MS + 1), 7, changedAt)).toEqual(expiresAt);
  });

  it("作成日 + 新しい日数がちょうど変えた時点のものは、過ぎた側として扱う", () => {
    const expiresAt = at(20 * DAY_MS);
    expect(retimedExpiresAt(at(-7 * DAY_MS - 1), expiresAt, 7, changedAt)).toEqual(at(7 * DAY_MS));
    expect(retimedExpiresAt(at(-7 * DAY_MS), expiresAt, 7, changedAt)).toEqual(at(7 * DAY_MS));
    expect(retimedExpiresAt(at(-7 * DAY_MS + 1), expiresAt, 7, changedAt)).toEqual(at(1));
  });

  it("短くして期限を引き直したセクションは、後で延ばしても期限を過ぎない", () => {
    // 10 日前に書いたセクションを 30 日 → 7 日に短くし、その 2 日後に 9 日へ延ばす
    const createdAt = at(-10 * DAY_MS);
    const shortened = retimedExpiresAt(createdAt, at(20 * DAY_MS), 7, changedAt);
    expect(shortened).toEqual(at(7 * DAY_MS));
    const lengthenedAt = at(2 * DAY_MS);
    const lengthened = retimedExpiresAt(createdAt, shortened, 9, lengthenedAt);
    expect(lengthened).toEqual(at(7 * DAY_MS));
    expect(lengthened.getTime()).toBeGreaterThan(lengthenedAt.getTime());
  });
});
