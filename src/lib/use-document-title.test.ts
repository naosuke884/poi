import { describe, expect, it } from "vitest";
import { documentTitle } from "./use-document-title";

describe("documentTitle", () => {
  it("ページ名があれば「ページ名 | poi」、無ければトップのタイトル (issue #121, #145)", () => {
    expect(documentTitle("利用規約")).toBe("利用規約 | poi");
    expect(documentTitle()).toBe("poi - 30 日で消えるメモ帳");
  });
});
