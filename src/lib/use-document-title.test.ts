import { describe, expect, it } from "vitest";
import { documentTitle } from "./use-document-title";

describe("documentTitle", () => {
  it("ページ名があれば「ページ名 | poi」、無ければ「poi」だけ (issue #121)", () => {
    expect(documentTitle("利用規約")).toBe("利用規約 | poi");
    expect(documentTitle()).toBe("poi");
  });
});
