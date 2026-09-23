import { describe, expect, it } from "vitest";
import { urlHref } from "./section-markdown";

describe("urlHref", () => {
  it("http(s): / mailto: はそのまま", () => {
    expect(urlHref("https://example.com")).toBe("https://example.com");
    expect(urlHref("HTTP://example.com")).toBe("HTTP://example.com");
    expect(urlHref("mailto:a@example.com")).toBe("mailto:a@example.com");
  });

  it("スキーム無しの www. とメールアドレスは補う", () => {
    expect(urlHref("www.example.com")).toBe("http://www.example.com");
    expect(urlHref("a@example.com")).toBe("mailto:a@example.com");
  });

  it("それ以外のスキームは開かない", () => {
    expect(urlHref("javascript:alert(1)")).toBeNull();
    expect(urlHref("JavaScript:alert(1)")).toBeNull();
    expect(urlHref("data:text/html,x")).toBeNull();
    expect(urlHref("vbscript:x")).toBeNull();
  });
});
