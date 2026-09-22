import { hc } from "hono/client";
import type { ApiType } from "@worker/index";

// Hono RPC: Worker 側のルート定義から型付きクライアントを生成
export const api = hc<ApiType>("/api");
