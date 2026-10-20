import { DAY_MS } from "@shared/constants";
import { describe, expect, it } from "vite-plus/test";

import { countPastPeriod } from "./ttl-past-period";

describe("countPastPeriod", () => {
  const now = new Date("2026-09-27T00:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("書いてから選んだ日数をもう過ぎているセクションだけ数える", () => {
    const createdAts = [ago(0.5 * DAY_MS), ago(3 * DAY_MS), ago(10 * DAY_MS)];
    expect(countPastPeriod(createdAts, 1, now)).toBe(2);
    expect(countPastPeriod(createdAts, 7, now)).toBe(1);
    expect(countPastPeriod(createdAts, 30, now)).toBe(0);
  });

  it("書いてからちょうど選んだ日数のものは過ぎた側に数える", () => {
    expect(countPastPeriod([ago(3 * DAY_MS - 1)], 3, now)).toBe(0);
    expect(countPastPeriod([ago(3 * DAY_MS)], 3, now)).toBe(1);
    expect(countPastPeriod([ago(3 * DAY_MS + 1)], 3, now)).toBe(1);
  });
});
