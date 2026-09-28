"use client";

/**
 * Safe browser storage wrapper. Storage can be unavailable (private mode, blocked
 * site data), so every access is wrapped and falls back to in-memory state.
 * Used for guest-mode persistence and per-viewer conveniences only.
 */
const memory = new Map<string, string>();
const PREFIX = "xrpt:";

export function readLocal<T>(key: string, fallback: T): T {
  const k = PREFIX + key;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(k) : memory.get(k) ?? null;
    if (raw === null) return memory.has(k) ? (JSON.parse(memory.get(k)!) as T) : fallback;
    return JSON.parse(raw) as T;
  } catch {
    try {
      return memory.has(k) ? (JSON.parse(memory.get(k)!) as T) : fallback;
    } catch {
      return fallback;
    }
  }
}

export function writeLocal<T>(key: string, value: T): void {
  const k = PREFIX + key;
  const raw = JSON.stringify(value);
  memory.set(k, raw);
  try {
    window.localStorage.setItem(k, raw);
    window.dispatchEvent(new CustomEvent("xrpt-storage", { detail: { key } }));
  } catch {
    /* storage unavailable — memory copy kept */
  }
}

export function removeLocal(key: string): void {
  const k = PREFIX + key;
  memory.delete(k);
  try {
    window.localStorage.removeItem(k);
    window.dispatchEvent(new CustomEvent("xrpt-storage", { detail: { key } }));
  } catch {
    /* ignore */
  }
}

/** Export every XRP Terminal key (GDPR data export for guest mode). */
export function exportAllLocal(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) {
        try {
          out[k.slice(PREFIX.length)] = JSON.parse(window.localStorage.getItem(k) ?? "null");
        } catch {
          out[k.slice(PREFIX.length)] = window.localStorage.getItem(k);
        }
      }
    }
  } catch {
    memory.forEach((v, k) => (out[k.slice(PREFIX.length)] = JSON.parse(v)));
  }
  return out;
}

export function clearAllLocal(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  memory.clear();
}
