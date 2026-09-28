import "server-only";
import { XrplClient } from "./client";
import type { AccountInfoResult } from "./types";

/**
 * Server-side XRPL access (route handlers). One lazily-connected client per server instance,
 * using the shared failover client. Requires a runtime with global WebSocket (Node ≥ 22).
 */
let client: XrplClient | null = null;

function getServerClient(): XrplClient {
  if (typeof WebSocket === "undefined") throw new Error("WebSocket is not available in this server runtime (Node ≥ 22 required)");
  if (!client) client = new XrplClient();
  return client;
}

export async function xrplServerRequest<T>(command: string, params: Record<string, unknown>, timeoutMs = 12_000): Promise<{ result: T; server: string | null }> {
  const c = getServerClient();
  const result = await c.request<T>(command, params, timeoutMs);
  return { result, server: c.server };
}

export type AccountExistence =
  | { exists: true; info: AccountInfoResult; server: string | null }
  | { exists: false; server: string | null };

/** account_info on the validated ledger; `actNotFound` → exists:false. Other errors throw. */
export async function fetchAccountExistence(classic: string): Promise<AccountExistence> {
  try {
    const { result, server } = await xrplServerRequest<AccountInfoResult>("account_info", { account: classic, ledger_index: "validated" });
    return { exists: true, info: result, server };
  } catch (e) {
    const code = (e as Error & { code?: string }).code;
    if (code === "actNotFound") return { exists: false, server: client?.server ?? null };
    throw e;
  }
}
