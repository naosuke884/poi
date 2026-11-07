// CSS の import はテストでは CSS Modules の偽物になり中身を読めないので、ファイルとして読む
/// <reference types="node" />
import { readFileSync } from "node:fs";

import { MEMO_TTL_DAYS } from "@shared/constants";
import { describe, expect, it } from "vite-plus/test";

const css = readFileSync(new URL("./LifeLineDemo.module.css", import.meta.url), "utf8");

describe("LifeLineDemo.module.css", () => {
  it("バーの全体の長さは保存期間の既定値 (MEMO_TTL_DAYS) と同じ日数", () => {
    expect(css).toContain(`--life-demo-total: ${MEMO_TTL_DAYS};`);
  });

  it("1 日から既定値までのどの日数でも、from と to の CSS 変数が決まる", () => {
    for (let n = 1; n <= MEMO_TTL_DAYS; n++) {
      expect(css).toContain(`.days[data-from="${n}"] {\n  --life-demo-from: ${n};`);
      expect(css).toContain(`.days[data-to="${n}"] {\n  --life-demo-to: ${n};`);
    }
  });
});
