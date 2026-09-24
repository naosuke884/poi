import type { ApiType } from "@worker/index";
import { hc } from "hono/client";

// Hono RPC: Worker 側のルート定義から型付きクライアントを生成
export const api = hc<ApiType>("/api");
