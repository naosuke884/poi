import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

const api = new Hono<{ Bindings: Env }>()
  .get("/hello", (c) => c.json({ message: "Hello from Hono on Cloudflare Workers!" }))
  .get("/time", (c) => c.json({ now: new Date().toISOString() }));

app.route("/api", api);

// 未定義の /api/* は 404 JSON、それ以外は SPA (index.html) にフォールバック
app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "Not Found" }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export type ApiType = typeof api;

export default app;
