/**
 * Minimal XRPL WebSocket client (browser + Node 22, both have global WebSocket).
 * Provider abstraction (spec §308): public server list with automatic failover.
 * All data comes directly from XRP Ledger servers — nothing is fabricated.
 */

export const XRPL_SERVERS = [
  { id: "xrplcluster", url: "wss://xrplcluster.com", name: "XRPL Cluster (full history)" },
  { id: "ripple-s2", url: "wss://s2.ripple.com", name: "Ripple s2 (full history)" },
  { id: "ripple-s1", url: "wss://s1.ripple.com", name: "Ripple s1" },
  { id: "xrpl-labs", url: "wss://xrpl.ws", name: "XRPL Labs" },
] as const;

type Json = Record<string, unknown>;
type Pending = { resolve: (v: Json) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
type StreamHandler = (msg: Json) => void;

export type XrplConnState = "idle" | "connecting" | "connected" | "reconnecting" | "failed";

export class XrplClient {
  private ws: WebSocket | null = null;
  private seq = 1;
  private pending = new Map<number, Pending>();
  private handlers = new Set<StreamHandler>();
  private stateHandlers = new Set<(s: XrplConnState, server?: string) => void>();
  private serverIndex = 0;
  private connectPromise: Promise<void> | null = null;
  private subscriptions: Json[] = [];
  private closedByUser = false;
  private retry = 0;
  state: XrplConnState = "idle";
  server: string | null = null;

  constructor(private servers: readonly { id: string; url: string; name: string }[] = XRPL_SERVERS) {}

  private setState(s: XrplConnState) {
    this.state = s;
    this.stateHandlers.forEach((h) => h(s, this.server ?? undefined));
  }

  onState(h: (s: XrplConnState, server?: string) => void) {
    this.stateHandlers.add(h);
    return () => this.stateHandlers.delete(h);
  }

  onMessage(h: StreamHandler) {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  connect(): Promise<void> {
    if (this.ws && this.ws.readyState === 1) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.closedByUser = false;
    this.connectPromise = this.tryServers().finally(() => (this.connectPromise = null));
    return this.connectPromise;
  }

  private async tryServers(): Promise<void> {
    const n = this.servers.length;
    let lastErr: Error | null = null;
    for (let i = 0; i < n; i++) {
      const srv = this.servers[(this.serverIndex + i) % n];
      this.setState(this.retry ? "reconnecting" : "connecting");
      try {
        await this.open(srv.url);
        this.serverIndex = (this.serverIndex + i) % n;
        this.server = srv.url;
        this.retry = 0;
        this.setState("connected");
        // resubscribe
        for (const s of this.subscriptions) this.send({ ...s }).catch(() => undefined);
        return;
      } catch (e) {
        lastErr = e as Error;
      }
    }
    this.setState("failed");
    throw lastErr ?? new Error("No XRPL server reachable");
  }

  private open(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            ws.close();
          } catch {}
          reject(new Error(`timeout connecting ${url}`));
        }
      }, 8000);
      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.ws = ws;
        resolve();
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`error connecting ${url}`));
        }
      };
      ws.onclose = () => {
        if (this.ws === ws) {
          this.ws = null;
          this.pending.forEach((p) => {
            clearTimeout(p.timer);
            p.reject(new Error("connection closed"));
          });
          this.pending.clear();
          if (!this.closedByUser) this.scheduleReconnect();
        }
      };
      ws.onmessage = (ev) => {
        let msg: Json;
        try {
          msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
        } catch {
          return;
        }
        const id = msg.id as number | undefined;
        if (typeof id === "number" && this.pending.has(id)) {
          const p = this.pending.get(id)!;
          this.pending.delete(id);
          clearTimeout(p.timer);
          if (msg.status === "error" || msg.error) {
            const err = new Error(String(msg.error_message || msg.error || "XRPL error")) as Error & { code?: string };
            err.code = String(msg.error ?? "");
            p.reject(err);
          } else p.resolve((msg.result as Json) ?? msg);
        } else {
          this.handlers.forEach((h) => h(msg));
        }
      };
    });
  }

  private scheduleReconnect() {
    this.retry++;
    this.serverIndex = (this.serverIndex + 1) % this.servers.length;
    this.setState("reconnecting");
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.retry, 5));
    setTimeout(() => {
      if (!this.closedByUser) this.connect().catch(() => undefined);
    }, delay);
  }

  async request<T = Json>(command: string, params: Json = {}, timeoutMs = 15_000): Promise<T> {
    await this.connect();
    return this.send({ command, ...params }, timeoutMs) as Promise<T>;
  }

  private send(payload: Json, timeoutMs = 15_000): Promise<Json> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) return reject(new Error("not connected"));
      const id = this.seq++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`XRPL request timed out (${payload.command})`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, ...payload }));
    });
  }

  /** Subscribe to streams (e.g. ["ledger", "transactions"]). Re-applied after reconnect. */
  async subscribe(params: Json) {
    this.subscriptions.push({ command: "subscribe", ...params });
    return this.request("subscribe", params);
  }

  async unsubscribe(params: Json) {
    this.subscriptions = this.subscriptions.filter((s) => JSON.stringify({ ...s, command: undefined }) !== JSON.stringify({ ...params, command: undefined }));
    try {
      return await this.request("unsubscribe", params);
    } catch {
      return null;
    }
  }

  close() {
    this.closedByUser = true;
    this.subscriptions = [];
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.setState("idle");
  }
}

/* Shared singleton for the browser so pages don't open many sockets. */
let shared: XrplClient | null = null;
export function getXrplClient(): XrplClient {
  if (!shared) shared = new XrplClient();
  return shared;
}
