import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type CampaignRow = {
  id: string;
  meta_campaign_id: string | null;
  name: string;
  country: string | null;
  run_by: string | null;
  delivery_status: string;
  objective: string | null;
  daily_budget: number | null;
  meta_created_at: string | null;
  spend: number;
  leads: number;
  impressions: number;
  clicks: number;
};
export type AdRow = { id: string; name: string; delivery_status: string | null; spend: number; leads: number; impressions: number; clicks: number };
export type AdSetRow = AdRow & { daily_budget: number | null; ads: AdRow[] };
export type SyncRun = { started_at: string; finished_at: string | null; ok: boolean | null; error: string | null; triggered_by: string | null };
export type MonthTotals = { spend: number; leads: number; active: number; campaigns: number; last_sync: SyncRun | null; last_good_sync: string | null };

export const COUNTRIES = ["Korea", "Japan", "Turkiye", "Vietnam", "Indonesia", "Malaysia", "China", "Thailand", "Europe", "Umrah", "Other"];
const HINTS: Record<string, string[]> = {
  Korea: ["korea", "seoul", "jeju", "busan"],
  Japan: ["japan", "jepun", "tokyo", "osaka", "hokkaido"],
  Turkiye: ["turki", "turkey", "istanbul", "cappadocia"],
  Vietnam: ["vietnam", "hanoi", "danang", "da nang", "sapa", "ho chi minh"],
  Indonesia: ["indonesia", "bali", "bandung", "jakarta", "medan", "lombok", "padang", "aceh", "jogja", "yogya"],
  Malaysia: ["malaysia", "sabah", "kundasang", "semporna", "kk", "langkawi", "sarawak", "kota kinabalu"],
  China: ["china", "beijing", "shanghai", "xinjiang", "chongqing", "guangzhou", "yunnan"],
  Thailand: ["thai", "bangkok", "krabi", "phuket", "hatyai", "hat yai"],
  Europe: ["europe", "eropah", "london", "paris", "swiss", "spain", "sepanyol", "balkan", "uk"],
  Umrah: ["umrah", "umroh", "makkah", "madinah"],
};
/** A country suggested from words in the campaign name. Shown as a suggestion only, never saved by itself. */
export function guessCountry(name: string): string | null {
  const text = ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  for (const [country, words] of Object.entries(HINTS)) if (words.some((w) => text.includes(` ${w} `) || (w.length > 3 && text.includes(w)))) return country;
  return null;
}

/** Staff name suggested from a campaign name that ends in " - Name". A suggestion only. */
export function guessRunBy(name: string): string | null {
  const m = name.match(/\s-\s([A-Za-z][A-Za-z .']{1,24})\s*$/);
  return m ? m[1].trim() : null;
}

export const rm = (n: number) => `RM${Math.round(n).toLocaleString("en-MY")}`;
export const rm2 = (n: number) => `RM${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const cpl = (spend: number, leads: number) => (leads > 0 ? rm2(spend / leads) : "");
export const count = (n: number) => Math.round(n).toLocaleString("en-MY");
export const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";

const STATUS: Record<string, { text: string; tone: "g" | "a" | "r" | "n" }> = {
  ACTIVE: { text: "Active", tone: "g" },
  PAUSED: { text: "Paused", tone: "n" },
  CAMPAIGN_PAUSED: { text: "Campaign paused", tone: "n" },
  ADSET_PAUSED: { text: "Ad set paused", tone: "n" },
  ARCHIVED: { text: "Archived", tone: "n" },
  DELETED: { text: "Deleted", tone: "n" },
  IN_PROCESS: { text: "In review", tone: "a" },
  PENDING_REVIEW: { text: "In review", tone: "a" },
  WITH_ISSUES: { text: "Has issues", tone: "r" },
  DISAPPROVED: { text: "Rejected by Meta", tone: "r" },
};
export const delivery = (s?: string | null) => STATUS[s ?? ""] ?? { text: s ? s.toLowerCase().replace(/_/g, " ") : "Unknown", tone: "n" as const };

function useRpc<T>(fn: string, args: Record<string, unknown>, empty: T) {
  const [data, setData] = useState<T>(empty);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(supabase ? null : "Supabase is not connected in this build.");
  const key = JSON.stringify(args);
  const reload = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data: out, error: err } = await supabase.rpc(fn, JSON.parse(key));
    setLoading(false);
    if (err) setError(err.message);
    else {
      setError(null);
      setData((out ?? empty) as T);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, key]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, loading, error, reload, setData };
}

export const useCampaigns = (days: number) => useRpc<CampaignRow[]>("campaign_overview", { p_days: days }, []);
export const useMonthTotals = () => useRpc<MonthTotals | null>("month_totals", {}, null);

export async function fetchTree(campaignId: string, days: number): Promise<AdSetRow[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc("campaign_tree", { p_campaign: campaignId, p_days: days });
  return (data ?? []) as AdSetRow[];
}

export async function saveTag(id: string, country: string | null, runBy: string | null, email: string) {
  if (!supabase) return "Supabase is not connected in this build.";
  const { error } = await supabase.from("campaigns").update({ country, run_by: runBy, tagged_by_email: email, updated_at: new Date().toISOString() }).eq("id", id);
  return error?.message ?? null;
}

export async function syncNow() {
  if (!supabase) return { ok: false, error: "Supabase is not connected in this build." };
  const { data, error } = await supabase.functions.invoke("meta-sync", { body: { days: 3 } });
  if (error || !data?.ok) return { ok: false, error: (data?.error as string) || error?.message || "Sync failed." };
  return { ok: true, error: null, data };
}
