import { TAG_ICON_FALLBACK } from "@shared/constants";
import { describe, expect, it } from "vite-plus/test";

import { chooseTagIcon } from "./tag-icon";

/** Jev の代わり。送られた中身を控えて、決まった答えを返す */
function fakeJev(answer: unknown, status = 200) {
  const sent: { url: string; auth: string | null; body: unknown }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    sent.push({
      url,
      auth: new Headers(init.headers).get("authorization"),
      body: JSON.parse(init.body as string),
    });
    return new Response(JSON.stringify({ answers: { icon: answer } }), { status });
  }) as unknown as typeof fetch;
  return { fetcher, sent };
}

describe("chooseTagIcon", () => {
  it("タグの名前だけを送り、選ばれたアイコンを返す", async () => {
    const jev = fakeJev({ type: "choice", choice: "shopping", confidence: 0.98 });
    expect(await chooseTagIcon("買い物", "key", jev.fetcher)).toBe("shopping");
    expect(jev.sent).toHaveLength(1);
    expect(jev.sent[0]!.auth).toBe("Bearer key");
    const body = jev.sent[0]!.body as {
      state: string;
      questions: { icon: { instructions: { tag: string }; criteria: Record<string, string> } };
    };
    expect(body.state).toBe("");
    expect(body.questions.icon.instructions.tag).toBe("買い物");
    expect(Object.keys(body.questions.icon.criteria)).toContain("shopping");
  });

  it("キーが無ければ問い合わせずに、決まったアイコンにする", async () => {
    const jev = fakeJev({ type: "choice", choice: "shopping", confidence: 1 });
    expect(await chooseTagIcon("買い物", undefined, jev.fetcher)).toBe(TAG_ICON_FALLBACK);
    expect(jev.sent).toHaveLength(0);
  });

  it.each([
    ["候補に無いアイコン", { type: "choice", choice: "rocket", confidence: 1 }, 200],
    ["自信の無い選択", { type: "choice", choice: "work", confidence: 0.2 }, 200],
    ["選択でない答え", { type: "score", score: 0.9 }, 200],
    ["エラーの応答", { type: "choice", choice: "work", confidence: 1 }, 500],
  ])("%sは使わない", async (_, answer, status) => {
    expect(await chooseTagIcon("x", "key", fakeJev(answer, status).fetcher)).toBe(
      TAG_ICON_FALLBACK,
    );
  });

  it("通信できなくても例外を投げない", async () => {
    const failing = (async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch;
    expect(await chooseTagIcon("x", "key", failing)).toBe(TAG_ICON_FALLBACK);
  });
});
