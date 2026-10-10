import { describe, expect, it } from "vite-plus/test";

import { withClearSiteData } from "./clear-site-data";

const call = (path: string, init: { method?: string; status?: number } = {}) =>
  withClearSiteData(
    new Request(`http://localhost${path}`, { method: init.method ?? "POST" }),
    new Response(JSON.stringify({ success: true }), {
      status: init.status ?? 200,
      headers: { "Set-Cookie": "better-auth.session_token=; Max-Age=0" },
    }),
  );

describe("withClearSiteData (issue #136)", () => {
  it.each(["/api/auth/sign-out", "/api/auth/delete-user"])(
    "%s の成功時は cookie を消すよう指示し、本文と Set-Cookie はそのまま返す",
    async (path) => {
      const res = call(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("Clear-Site-Data")).toBe('"cookies"');
      expect(res.headers.get("Set-Cookie")).toBe("better-auth.session_token=; Max-Age=0");
      expect(await res.json()).toEqual({ success: true });
    },
  );

  it("失敗したとき (セッションの鮮度切れ等) は付けない: ログイン状態のまま残す", () => {
    expect(call("/api/auth/delete-user", { status: 400 }).headers.has("Clear-Site-Data")).toBe(
      false,
    );
    expect(call("/api/auth/sign-out", { status: 401 }).headers.has("Clear-Site-Data")).toBe(false);
  });

  it("ほかのエンドポイントや POST 以外には付けない", () => {
    expect(call("/api/auth/get-session", { method: "GET" }).headers.has("Clear-Site-Data")).toBe(
      false,
    );
    expect(call("/api/auth/sign-out", { method: "GET" }).headers.has("Clear-Site-Data")).toBe(
      false,
    );
    expect(call("/api/auth/multi-session/set-active").headers.has("Clear-Site-Data")).toBe(false);
  });
});
