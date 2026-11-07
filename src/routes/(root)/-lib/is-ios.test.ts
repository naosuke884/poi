import { describe, expect, it } from "vite-plus/test";

import { isIos } from "./is-ios";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

describe("isIos", () => {
  it("iPhone の UA なら iOS", () => {
    expect(isIos(IPHONE, true)).toBe(true);
  });

  it("Mac を名乗っていてもタッチできれば iPad (iPadOS の Safari) とみなす", () => {
    expect(isIos(MAC, true)).toBe(true);
    expect(isIos(MAC, false)).toBe(false);
  });

  it("Android は iOS ではない", () => {
    expect(isIos(ANDROID, true)).toBe(false);
  });
});
