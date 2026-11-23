import { describe, expect, it } from "vite-plus/test";

import { normalizeTag, TAG_MAX_LENGTH } from "./constants";

describe("normalizeTag", () => {
  it("前後の空白と先頭の # を落とし、途中の空白の並びを半角スペース 1 つにする", () => {
    expect(normalizeTag("  #買い物 ")).toBe("買い物");
    expect(normalizeTag("## 作業　\tログ")).toBe("作業 ログ");
    expect(normalizeTag("C#")).toBe("C#");
  });

  it("日本語入力の全角の ＃ も、半角の # と同じく先頭から落とす", () => {
    expect(normalizeTag("＃買い物")).toBe("買い物");
    expect(normalizeTag("＃ #　＃家")).toBe("家");
    expect(normalizeTag("C＃")).toBe("C＃");
  });

  it("先頭に # と空白が混ざって続いても、まとめて落とす", () => {
    expect(normalizeTag("# #a")).toBe("a");
    expect(normalizeTag("#\n# 家")).toBe("家");
  });

  it("通した結果をもう一度通しても変わらない (サーバはこの形だけを受け付ける)", () => {
    for (const input of [
      "# #a",
      " ## b  c ",
      "#\t#　d",
      "＃ ＃f",
      "e#",
      "x".repeat(TAG_MAX_LENGTH),
    ]) {
      const once = normalizeTag(input);
      expect(once).not.toBeNull();
      expect(normalizeTag(once!)).toBe(once);
    }
  });

  it("空になる・長すぎるときは null", () => {
    expect(normalizeTag("")).toBeNull();
    expect(normalizeTag(" # # ")).toBeNull();
    expect(normalizeTag("x".repeat(TAG_MAX_LENGTH + 1))).toBeNull();
  });
});
