import { describe, expect, it } from "vite-plus/test";

import { DAY_MS, retimedExpiresAt } from "./constants";

describe("retimedExpiresAt", () => {
  const changedAt = new Date("2026-10-20T00:00:00.000Z");
  const at = (ms: number) => new Date(changedAt.getTime() + ms);

  describe("短くしたとき", () => {
    it("作成日 + 新しい日数がまだ先なら、その日時を新しい期限にする", () => {
      // 30 日 → 7 日: 3 日前に書いたもの
      expect(retimedExpiresAt(at(-3 * DAY_MS), at(27 * DAY_MS), 30, 7, changedAt)).toEqual(
        at(4 * DAY_MS),
      );
    });

    it("作成日 + 新しい日数をもう過ぎていれば、変えた時点 + 新しい日数にする (今の期限の方が遅いとき)", () => {
      // 30 日 → 7 日: 10 日前に書き、残り 20 日だったもの
      expect(retimedExpiresAt(at(-10 * DAY_MS), at(20 * DAY_MS), 30, 7, changedAt)).toEqual(
        at(7 * DAY_MS),
      );
    });

    it("今の期限の方が早ければ延ばさない", () => {
      // 30 日 → 7 日: 29 日前に書き、残り 1 日だったもの
      expect(retimedExpiresAt(at(-29 * DAY_MS), at(DAY_MS), 30, 7, changedAt)).toEqual(at(DAY_MS));
    });

    it("今の期限と変えた時点 + 新しい日数の、早い方を取る (同じならその日時)", () => {
      const expiresAt = at(7 * DAY_MS);
      expect(retimedExpiresAt(at(-10 * DAY_MS), at(7 * DAY_MS - 1), 30, 7, changedAt)).toEqual(
        at(7 * DAY_MS - 1),
      );
      expect(retimedExpiresAt(at(-10 * DAY_MS), expiresAt, 30, 7, changedAt)).toEqual(expiresAt);
      expect(retimedExpiresAt(at(-10 * DAY_MS), at(7 * DAY_MS + 1), 30, 7, changedAt)).toEqual(
        expiresAt,
      );
    });

    it("作成日 + 新しい日数がちょうど変えた時点のものは、過ぎた側として扱う", () => {
      const expiresAt = at(20 * DAY_MS);
      expect(retimedExpiresAt(at(-7 * DAY_MS - 1), expiresAt, 30, 7, changedAt)).toEqual(
        at(7 * DAY_MS),
      );
      expect(retimedExpiresAt(at(-7 * DAY_MS), expiresAt, 30, 7, changedAt)).toEqual(
        at(7 * DAY_MS),
      );
      expect(retimedExpiresAt(at(-7 * DAY_MS + 1), expiresAt, 30, 7, changedAt)).toEqual(at(1));
    });
  });

  describe("延ばしたとき", () => {
    it("作成日 + 新しい日数がまだ先なら、短くして早めた期限もそこまで延ばす", () => {
      // 7 日 → 30 日: 20 日前に書き、短くして残り 2 日になっていたもの
      expect(retimedExpiresAt(at(-20 * DAY_MS), at(2 * DAY_MS), 7, 30, changedAt)).toEqual(
        at(10 * DAY_MS),
      );
    });

    it("作成日 + 新しい日数をもう過ぎていれば、変えた時点 + 新しい日数まで延ばす", () => {
      // 7 日 → 30 日: 40 日前に書き、短くして残り 2 日になっていたもの
      expect(retimedExpiresAt(at(-40 * DAY_MS), at(2 * DAY_MS), 7, 30, changedAt)).toEqual(
        at(30 * DAY_MS),
      );
    });

    it("作成日 + 新しい日数より今の期限が遅ければ、期限を早めない", () => {
      // 7 日 → 14 日: 10 日前に書き、30 日 → 7 日に短くして残り 7 日になっていたもの (作成日 + 14 日は残り 4 日)
      expect(retimedExpiresAt(at(-10 * DAY_MS), at(7 * DAY_MS), 7, 14, changedAt)).toEqual(
        at(7 * DAY_MS),
      );
    });

    it("短くしてから延ばすと、最初からその日数に変えたときと同じ期限になる", () => {
      // 10 日前に書き残り 20 日のセクションを、30 日 → 1 日に短くし、続けて 7 日に延ばす
      const createdAt = at(-10 * DAY_MS);
      const shortened = retimedExpiresAt(createdAt, at(20 * DAY_MS), 30, 1, changedAt);
      expect(shortened).toEqual(at(DAY_MS));
      expect(retimedExpiresAt(createdAt, shortened, 1, 7, changedAt)).toEqual(
        retimedExpiresAt(createdAt, at(20 * DAY_MS), 30, 7, changedAt),
      );
    });

    it("短くしてから元の日数に戻すと、元の期限に戻る", () => {
      const createdAt = at(-10 * DAY_MS);
      const original = at(20 * DAY_MS);
      for (const shorter of [1, 7, 14]) {
        const shortened = retimedExpiresAt(createdAt, original, 30, shorter, changedAt);
        expect(retimedExpiresAt(createdAt, shortened, shorter, 30, changedAt)).toEqual(original);
      }
    });
  });

  it("同じ日数なら、引き直した後の期限でもそのまま", () => {
    // 30 日 → 7 日に短くして残り 7 日 (作成日 + 7 日はもう過ぎている) のものを、2 日後に 7 日のまま保存し直す
    expect(retimedExpiresAt(at(-10 * DAY_MS), at(7 * DAY_MS), 7, 7, at(2 * DAY_MS))).toEqual(
      at(7 * DAY_MS),
    );
  });
});
