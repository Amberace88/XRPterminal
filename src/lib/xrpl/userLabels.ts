"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { readLocal, writeLocal } from "@/lib/storage/local";
import { userLabel, type LabelCategory, type WalletLabel } from "./labels";

/** User-provided wallet labels — guest: this browser; signed in: Supabase `wallet_labels` (RLS). */
export interface UserLabelRepo {
  list(): Promise<WalletLabel[]>;
  save(address: string, name: string, category?: LabelCategory): Promise<void>;
  remove(address: string): Promise<void>;
  persistent: "local" | "account";
}

const KEY = "xrpl:userLabels";
type Stored = { address: string; name: string; category: LabelCategory; createdAt: number };

function localRepo(): UserLabelRepo {
  return {
    persistent: "local",
    async list() {
      return readLocal<Stored[]>(KEY, []).map((s) => userLabel(s.address, s.name, s.category));
    },
    async save(address, name, category = "UNKNOWN") {
      const all = readLocal<Stored[]>(KEY, []).filter((s) => s.address !== address);
      all.push({ address, name: name.slice(0, 60), category, createdAt: Date.now() });
      writeLocal(KEY, all.slice(-500));
    },
    async remove(address) {
      writeLocal(
        KEY,
        readLocal<Stored[]>(KEY, []).filter((s) => s.address !== address),
      );
    },
  };
}

function supabaseRepo(sb: SupabaseClient, userId: string): UserLabelRepo {
  return {
    persistent: "account",
    async list() {
      const { data, error } = await sb.from("wallet_labels").select("address, label, category").eq("user_id", userId).eq("is_user_provided", true);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r: { address: string; label: string; category: string }) => userLabel(r.address, r.label, (r.category as LabelCategory) ?? "UNKNOWN"));
    },
    async save(address, name, category = "UNKNOWN") {
      await sb.from("wallet_labels").delete().eq("user_id", userId).eq("address", address).eq("is_user_provided", true);
      const { error } = await sb.from("wallet_labels").insert({
        user_id: userId,
        address,
        label: name.slice(0, 60),
        category,
        source: "user",
        is_user_provided: true,
      });
      if (error) throw new Error(error.message);
    },
    async remove(address) {
      const { error } = await sb.from("wallet_labels").delete().eq("user_id", userId).eq("address", address).eq("is_user_provided", true);
      if (error) throw new Error(error.message);
    },
  };
}

export function getUserLabelRepo(userId: string | null): UserLabelRepo {
  const sb = userId ? getSupabaseBrowser() : null;
  return sb && userId ? supabaseRepo(sb, userId) : localRepo();
}
