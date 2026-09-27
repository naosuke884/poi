import { DAY_MS } from "@shared/constants";
import { describe, expect, it } from "vitest";
import { countExpiring } from "./ttl-expiring";

describe("countExpiring", () => {
  const now = new Date("2026-09-27T00:00:00Z");
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();

  it("作成日 + 日数が今以前のセクションだけ数える", () => {
    const createdAts = [ago(0.5), ago(3), ago(10)];
    expect(countExpiring(createdAts, 1, now)).toBe(2);
    expect(countExpiring(createdAts, 7, now)).toBe(1);
    expect(countExpiring(createdAts, 30, now)).toBe(0);
  });

  it("ちょうど期限の時刻のものも消える側に数える", () => {
    expect(countExpiring([ago(3)], 3, now)).toBe(1);
  });
});
