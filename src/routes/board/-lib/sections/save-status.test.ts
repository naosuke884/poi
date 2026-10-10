import { describe, expect, it } from "vite-plus/test";

import {
  NO_SAVE_ANNOUNCEMENT,
  nextSaveAnnouncement,
  type SaveAnnouncement,
  type SaveStatus,
} from "./save-status";

const OFFLINE = "オフラインです。オンライン復帰後に再保存してください";

/** 状態の列を順に流し、各時点の読み上げ文言を返す */
const run = (steps: [SaveStatus, string | null][]) => {
  let a: SaveAnnouncement = NO_SAVE_ANNOUNCEMENT;
  return steps.map(([status, problem]) => {
    a = nextSaveAnnouncement(a, status, problem);
    return a;
  });
};

describe("nextSaveAnnouncement", () => {
  it("ふだんの入力 → 保存中 → 保存済みでは何も読み上げない (issue #113)", () => {
    const steps = run([
      ["dirty", null],
      ["saving", null],
      ["saved", null],
      ["dirty", null],
      ["saving", null],
      ["dirty", null],
      ["saved", null],
    ]);
    for (const a of steps) expect(a).toEqual(NO_SAVE_ANNOUNCEMENT);
  });

  it("オフラインは alert で伝え、オフライン中の入力で繰り返しても文言は変えない (issue #113)", () => {
    expect(
      run([
        ["dirty", null],
        ["offline", OFFLINE],
        ["dirty", null],
        ["offline", OFFLINE],
      ]),
    ).toEqual([
      NO_SAVE_ANNOUNCEMENT,
      { alert: OFFLINE, status: "" },
      { alert: OFFLINE, status: "" },
      { alert: OFFLINE, status: "" },
    ]);
  });

  it("エラーやオフラインから戻って保存できたら「保存済み」を読み、次の変化で黙って消す (issue #113)", () => {
    expect(
      run([
        ["error", "保存に失敗: 500"],
        ["saving", null],
        ["saved", null],
        ["saved", null],
        ["dirty", null],
        ["saving", null],
        ["saved", null],
      ]),
    ).toEqual([
      { alert: "保存に失敗: 500", status: "" },
      { alert: "保存に失敗: 500", status: "" },
      { alert: "", status: "保存済み" },
      { alert: "", status: "保存済み" },
      NO_SAVE_ANNOUNCEMENT,
      NO_SAVE_ANNOUNCEMENT,
      NO_SAVE_ANNOUNCEMENT,
    ]);
  });

  it("エラーの文言が変われば読み直す (オフライン → エラー)", () => {
    expect(
      run([
        ["offline", OFFLINE],
        ["saving", null],
        ["error", "保存に失敗: 500"],
      ]).map((a) => a.alert),
    ).toEqual([OFFLINE, OFFLINE, "保存に失敗: 500"]);
  });

  it("同じ入力なら何度呼んでも同じ結果 (描画のたびに呼べる)", () => {
    for (const [status, problem] of [
      ["saved", null],
      ["dirty", null],
      ["offline", OFFLINE],
    ] as [SaveStatus, string | null][]) {
      for (const prev of [
        NO_SAVE_ANNOUNCEMENT,
        { alert: OFFLINE, status: "" },
        { alert: "", status: "保存済み" },
      ]) {
        const once = nextSaveAnnouncement(prev, status, problem);
        expect(nextSaveAnnouncement(once, status, problem)).toEqual(once);
      }
    }
  });
});
