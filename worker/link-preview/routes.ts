import { Hono } from "hono";
import { z } from "zod";

import { requireAuth } from "../auth/middleware";
import type { AppEnv } from "../types";
import { validate } from "../validate";
import { fetchPreview } from "./fetch-preview";

// リンクのプレビュー (題名とサイト名)。板に書いた URL のページを、ブラウザの代わりにサーバが取りに行く
// (ブラウザから他のサイトの HTML は読めない: CORS)。
// URL は本文 (POST の JSON) で受ける: クエリに入れると、アクセスのログにメモの中身 (URL) が残る (HAY-223)。
// 何も保存しない (取ってきた題名も)。取れなかったときも 200 で { preview: null } を返す (理由は区別しない。
// 失敗をエラーにすると、エラーのログに URL が出る)
const previewSchema = z.object({ url: z.string().min(1).max(2048) });

export const linkPreviewRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .post("/", validate("json", previewSchema), async (c) => {
    const { url } = c.req.valid("json");
    const preview = await fetchPreview(url, new URL(c.req.url).hostname);
    return c.json({ preview });
  });
