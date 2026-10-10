import { describe, expect, it } from "vite-plus/test";

import { affixInset } from "./affix";

describe("affixInset", () => {
  it("板の端はスクロールバーを含まない % で取る (vw だとスクロールバーの半分ずれる。issue #131)", () => {
    for (const side of ["left", "right"] as const) {
      const inset = affixInset(side);
      expect(inset).toContain("calc(50% - 30rem * var(--mantine-scale, 1) + 16px)");
      expect(inset).not.toMatch(/vw/);
    }
  });

  it("狭い画面では画面端から 16px + その側の safe-area", () => {
    expect(affixInset("left")).toContain("calc(16px + env(safe-area-inset-left))");
    expect(affixInset("right")).toContain("calc(16px + env(safe-area-inset-right))");
  });
});
