"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { apiGet, apiPost } from "@/hooks/useApi";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { readLocal, writeLocal } from "@/lib/storage/local";
import type { ConnectedAccount, Lot } from "./types";

/**
 * Guest vs account persistence (ARCHITECTURE "Guest vs account persistence pattern").
 * Guest: this browser only. Signed in + Supabase configured: server API (plan limits enforced
 * server-side) for connected accounts; RLS-protected table for lots.
 */

export interface AccountsRepo {
  kind: "local" | "account";
  list(): Promise<ConnectedAccount[]>;
  /** `input` is what the user typed (classic or X-address); `classic`/`tag` its validated normalisation. */
  addWallet(input: { input: string; classic: string; tag?: number | null; label: string }): Promise<ConnectedAccount>;
  update(id: string, patch: { label?: string; isPrimary?: boolean }): Promise<void>;
  remove(id: string): Promise<void>;
}

const ACC_KEY = "portfolio:accounts";

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function localAccounts(): AccountsRepo {
  const read = () => readLocal<ConnectedAccount[]>(ACC_KEY, []);
  return {
    kind: "local",
    async list() {
      return read();
    },
    async addWallet({ classic, tag, label }) {
      const all = read();
      if (all.some((a) => a.address === classic && (a.tag ?? null) === (tag ?? null))) throw new Error("This wallet is already connected.");
      const acc: ConnectedAccount = {
        id: uid(),
        type: "XRPL_WALLET",
        label: label.trim().slice(0, 60),
        address: classic,
        tag: tag ?? null,
        status: "active",
        lastSyncedAt: Date.now(),
        createdAt: Date.now(),
        isPrimary: all.length === 0,
      };
      writeLocal(ACC_KEY, [...all, acc]);
      return acc;
    },
    async update(id, patch) {
      writeLocal(
        ACC_KEY,
        read().map((a) =>
          a.id === id ? { ...a, ...(patch.label !== undefined ? { label: patch.label } : {}), ...(patch.isPrimary !== undefined ? { isPrimary: patch.isPrimary } : {}) } : patch.isPrimary ? { ...a, isPrimary: false } : a,
        ),
      );
    },
    async remove(id) {
      const rest = read().filter((a) => a.id !== id);
      if (rest.length && !rest.some((a) => a.isPrimary)) rest[0] = { ...rest[0], isPrimary: true };
      writeLocal(ACC_KEY, rest);
    },
  };
}

function remoteAccounts(): AccountsRepo {
  return {
    kind: "account",
    async list() {
      return (await apiGet<{ accounts: ConnectedAccount[] }>("/api/wallets")).accounts;
    },
    async addWallet({ input, label }) {
      // The server re-validates format + existence and re-derives classic address / X-address tag.
      const r = await apiPost<{ account: ConnectedAccount }>("/api/wallets", { address: input, label });
      return r.account;
    },
    async update(id, patch) {
      await apiPost("/api/wallets", { id, ...patch }, "PATCH");
    },
    async remove(id) {
      await apiGet(`/api/wallets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    },
  };
}

export function getAccountsRepo(userId: string | null): AccountsRepo {
  return userId && getSupabaseBrowser() ? remoteAccounts() : localAccounts();
}

/* --------------------------------- Lots ---------------------------------- */

export interface LotsRepo {
  kind: "local" | "account";
  list(): Promise<Lot[]>;
  save(l: Lot): Promise<void>;
  remove(id: string): Promise<void>;
}

const LOT_KEY = "portfolio:lots";

function localLots(): LotsRepo {
  return {
    kind: "local",
    async list() {
      return readLocal<Lot[]>(LOT_KEY, []);
    },
    async save(l) {
      const all = readLocal<Lot[]>(LOT_KEY, []).filter((x) => x.id !== l.id);
      writeLocal(LOT_KEY, [...all, l]);
    },
    async remove(id) {
      writeLocal(
        LOT_KEY,
        readLocal<Lot[]>(LOT_KEY, []).filter((x) => x.id !== id),
      );
    },
  };
}

interface LotRow {
  id: string;
  asset: "XRP";
  side: "buy" | "sell";
  trade_date: string;
  qty: string | number;
  price: string | number;
  fee: string | number;
  currency: Lot["currency"];
  note: string | null;
  created_at: string;
}

function supabaseLots(sb: SupabaseClient, userId: string): LotsRepo {
  return {
    kind: "account",
    async list() {
      const { data, error } = await sb.from("portfolio_lots").select("id, asset, side, trade_date, qty, price, fee, currency, note, created_at").eq("user_id", userId).order("trade_date");
      if (error) throw new Error(error.message);
      return (data as LotRow[]).map((r) => ({
        id: r.id,
        asset: r.asset,
        side: r.side,
        date: r.trade_date,
        qty: String(r.qty),
        price: String(r.price),
        fee: String(r.fee),
        currency: r.currency,
        note: r.note ?? undefined,
        createdAt: Date.parse(r.created_at),
      }));
    },
    async save(l) {
      const row = { id: l.id, user_id: userId, asset: l.asset, side: l.side, trade_date: l.date, qty: l.qty, price: l.price, fee: l.fee, currency: l.currency, note: l.note ?? null };
      const { error } = await sb.from("portfolio_lots").upsert(row);
      if (error) throw new Error(error.message);
    },
    async remove(id) {
      const { error } = await sb.from("portfolio_lots").delete().eq("id", id).eq("user_id", userId);
      if (error) throw new Error(error.message);
    },
  };
}

export function getLotsRepo(userId: string | null): LotsRepo {
  const sb = userId ? getSupabaseBrowser() : null;
  return sb && userId ? supabaseLots(sb, userId) : localLots();
}

export const newId = uid;
