import { createAuthClient } from "better-auth/react";

// 同一オリジンの /api/auth を叩くので baseURL 指定は不要
export const authClient = createAuthClient();

export type Session = typeof authClient.$Infer.Session;
