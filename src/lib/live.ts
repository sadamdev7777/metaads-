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
  destination_id: string | null;
  destination: string | null;
  destination_manual: boolean;
  spend: number;
  leads: number;
  impressions: number;
  clicks: number;
};
export type AdRow = { id: string; name: string; delivery_status: string | null; spend: number; leads: number; impressions: number; clicks: number };
export type AdSetRow = AdRow & { daily_budget: number | null; ads: AdRow[] };
export type SyncRun = { started_at: string; finished_at: string | null; ok: boolean | null; error: string | null; triggered_by: string | null };
export type MonthTotals = { spend: number; leads: number; active: number; campaigns: number; last_sync: SyncRun | null; last_good_sync: string | null };

export const COUNTRIES = ["Korea", "Japan", "Turkiye", "Vietnam", "Indonesia", "Malaysia", "China", "Taiwan", "Thailand", "India", "Europe", "Umrah", "Other"];
const HINTS: Record<string, string[]> = {
  Korea: ["korea", "seoul", "jeju", "busan"],
  Japan: ["japan", "jepun", "tokyo", "osaka", "hokkaido"],
  Turkiye: ["turki", "turkey", "istanbul", "cappadocia"],
  Vietnam: ["vietnam", "hanoi", "danang", "da nang", "sapa", "ho chi minh", "phu quoc", "hcm", "dalat"],
  Indonesia: ["indonesia", "bali", "bandung", "jakarta", "medan", "lombok", "padang", "aceh", "jogja", "yogya"],
  Malaysia: ["malaysia", "sabah", "kundasang", "semporna", "mabul", "kk", "langkawi", "sarawak", "kota kinabalu"],
  China: ["china", "beijing", "shanghai", "xinjiang", "chongqing", "guangzhou", "yunnan", "xian", "guilin", "chengdu"],
  Taiwan: ["taiwan", "taipei"],
  India: ["india", "kashmir"],
  Thailand: ["thai", "bangkok", "krabi", "phuket", "hatyai", "hat yai"],
  Europe: ["europe", "eropah", "london", "paris", "swiss", "itali", "spain", "sepanyol", "balkan", "uk"],
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

export async function saveTag(id: string, dest: Destination | null, runBy: string | null, email: string) {
  if (!supabase) return "Supabase is not connected in this build.";
  const { error } = await supabase
    .from("campaigns")
    .update({ destination_id: dest?.id ?? null, country: dest?.country ?? null, destination_manual: true, run_by: runBy, tagged_by_email: email, updated_at: new Date().toISOString() })
    .eq("id", id);
  return error?.message ?? null;
}

export async function syncNow() {
  if (!supabase) return { ok: false, error: "Supabase is not connected in this build." };
  const { data, error } = await supabase.functions.invoke("meta-sync", { body: { days: 2, structure: "active" } });
  if (error || !data?.ok) return { ok: false, error: (data?.error as string) || error?.message || "Sync failed." };
  return { ok: true, error: null, data };
}

/* ---------- Luqman, the night analyst ---------- */
export type Report = {
  id: number;
  created_at: string;
  summary: string;
  findings: { title?: string; detail?: string }[];
  review: { proposal?: string; verdict?: string; detail?: string }[];
  model: string | null;
  triggered_by: string | null;
};
export type Lesson = { id: number; created_at: string; lesson: string; evidence: string | null; confidence: string | null };
export type Proposal = {
  id: string;
  created_at: string;
  action_type: string;
  target: string;
  reason: string | null;
  numbers: string | null;
  expected: string | null;
  confidence: string | null;
  status: string;
  decided_by_email: string | null;
  decided_at: string | null;
  apply_note: string | null;
};
export type AdsAction = { id: number; proposal_id: string | null; kind: string; ok: boolean; undone_at: string | null };
export type ApplyResult = { ok: boolean; error?: string; note?: string; manual?: boolean; need_budget?: boolean; current?: number; max?: number; name?: string; level?: string };

/** What kind of change a proposal is, so the page knows whether Adam can make it in Meta. */
export function proposalKind(actionType: string): "pause" | "budget" | "manual" {
  const t = actionType.toLowerCase();
  if (/turn off|pause|stop/.test(t)) return "pause";
  if (/raise|lower|increase|decrease|reduce/.test(t) && !/move/.test(t)) return "budget";
  return "manual";
}
export async function adam(body: Record<string, unknown>): Promise<ApplyResult> {
  if (!supabase) return { ok: false, error: "Supabase is not connected in this build." };
  const { data, error } = await supabase.functions.invoke("ads-action", { body });
  if (error && !data) return { ok: false, error: error.message };
  return (data ?? { ok: false, error: "No answer." }) as ApplyResult;
}
export async function fetchAdsActions(): Promise<AdsAction[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("ads_actions").select("id, proposal_id, kind, ok, undone_at").eq("ok", true).order("id", { ascending: false }).limit(100);
  return (data ?? []) as AdsAction[];
}

export async function fetchLatestReport(): Promise<Report | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("ai_reports").select("*").order("id", { ascending: false }).limit(1).maybeSingle();
  return (data as Report) ?? null;
}
export async function fetchLessons(): Promise<Lesson[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("ai_learnings").select("id, created_at, lesson, evidence, confidence").eq("is_active", true).order("id", { ascending: false }).limit(100);
  return (data ?? []) as Lesson[];
}
export async function removeLesson(id: number, email: string) {
  if (!supabase) return;
  await supabase.from("ai_learnings").update({ is_active: false, edited_by_email: email }).eq("id", id);
}
export async function fetchProposals(): Promise<Proposal[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("proposals").select("*").eq("is_sample", false).order("created_at", { ascending: false }).limit(60);
  return (data ?? []) as Proposal[];
}
export async function decideProposal(id: string, status: "approved" | "rejected", email: string) {
  if (!supabase) return "Supabase is not connected in this build.";
  const { data: me } = await supabase.auth.getUser();
  const { error } = await supabase.from("proposals").update({ status, decided_by: me.user?.id ?? null, decided_by_email: email, decided_at: new Date().toISOString() }).eq("id", id);
  return error?.message ?? null;
}
export async function pendingCount(): Promise<number> {
  if (!supabase) return 0;
  const { count: n } = await supabase.from("proposals").select("id", { count: "exact", head: true }).eq("status", "pending").eq("is_sample", false);
  return n ?? 0;
}
type AnalystResult = { ok: boolean; error?: string; [k: string]: unknown };
export async function analyst(action: string, extra: Record<string, unknown> = {}): Promise<AnalystResult> {
  if (!supabase) return { ok: false, error: "Supabase is not connected in this build." };
  const { data, error } = await supabase.functions.invoke("ai-analyst", { body: { action, ...extra } });
  if (error || !data?.ok) return { ok: false, error: (data?.error as string) || error?.message || "Something went wrong." };
  return data as AnalystResult;
}
export const confTone = (c?: string | null) => (c === "high" ? "g" : c === "medium" ? "a" : "n") as "g" | "a" | "n";

/* ---------- Deposits from TravelCRM, by country ---------- */
export type CountryCost = { country: string; spend: number; leads: number; bookings: number; pax: number; pax_direct: number; pax_shared: number };
export type CountryCostData = { first_booking_date: string | null; last_synced: string | null; rows: CountryCost[] };
export const useCountryCost = (days: number) => useRpc<CountryCostData | null>("country_cost", { p_days: days }, null);
/** Cost per pax deposit, counting only pax that do not look like agent or staff entries. */
export const perPax = (c: { spend: number; pax_direct: number }) => (c.pax_direct > 0 && c.spend > 0 ? c.spend / c.pax_direct : null);
export const paxTone = (v: number | null) => (v === null ? "n" : v > 80 ? "r" : v <= 50 ? "g" : "a") as "n" | "r" | "g" | "a";
export const paxLabel = (v: number | null) => (v === null ? "No figure" : v > 80 ? "Over RM80" : v <= 50 ? "On target" : "Watch");

/* ---------- Destinations: the owner's list that ties campaigns and TravelCRM packages together ---------- */
export type Destination = { id: string; name: string; country: string; keywords: string[] };
export type DestCost = { destination: string | null; country: string; matched: boolean; spend: number; leads: number; campaigns: number; bookings: number; pax: number; pax_direct: number; pax_shared: number };
export type DestCostData = { first_booking_date: string | null; last_synced: string | null; bookings_stored: number; bookings_without_package: number; rows: DestCost[] };
export const useDestinationCost = (days: number) => useRpc<DestCostData | null>("destination_cost", { p_days: days }, null);

export async function fetchDestinations(): Promise<Destination[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("destinations").select("id, name, country, keywords").order("country").order("name");
  return (data ?? []) as Destination[];
}
export async function saveDestination(d: { id?: string; name: string; country: string; keywords: string[] }, email: string) {
  if (!supabase) return "Supabase is not connected in this build.";
  const row = { name: d.name.trim(), country: d.country.trim(), keywords: d.keywords, updated_by_email: email, updated_at: new Date().toISOString() };
  const { error } = d.id ? await supabase.from("destinations").update(row).eq("id", d.id) : await supabase.from("destinations").insert(row);
  return error?.message ?? null;
}
export async function removeDestination(id: string) {
  if (!supabase) return "Supabase is not connected in this build.";
  const { error } = await supabase.from("destinations").delete().eq("id", id);
  return error?.message ?? null;
}
/** Re-reads every campaign name and TravelCRM package against the list. */
export async function rematch() {
  if (!supabase) return null;
  const { data } = await supabase.rpc("apply_destinations");
  return data as { campaigns_changed: number; departures_changed: number } | null;
}

/* ---------- Phase 3: media library and campaign drafts ---------- */
export type MediaItem = { id: string; file_name: string; file_path: string | null; placement: string | null; format: string | null; talent: string | null; note: string | null; destination_id: string | null; uploaded_by_email: string | null; size_bytes: number | null; created_at: string; url?: string };
export async function fetchMedia(): Promise<MediaItem[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("media").select("*").eq("is_sample", false).order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as MediaItem[];
  const paths = rows.map((r) => r.file_path).filter(Boolean) as string[];
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("media").createSignedUrls(paths, 3600);
    const map = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    rows.forEach((r) => (r.url = r.file_path ? map.get(r.file_path) ?? undefined : undefined));
  }
  return rows;
}
export async function uploadMedia(file: File, meta: { destination_id: string | null; placement: string; talent: string; note: string }, email: string) {
  if (!supabase) return "Supabase is not connected in this build.";
  const isVideo = file.type.startsWith("video/");
  if (!isVideo && !file.type.startsWith("image/")) return "Only image and video files can be uploaded.";
  const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safe}`;
  const up = await supabase.storage.from("media").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return /exceeded|too large|maximum/i.test(up.error.message) ? "The file is larger than the storage limit (50 MB unless raised in Supabase)." : up.error.message;
  const { error } = await supabase.from("media").insert({
    file_name: file.name, file_path: path, placement: meta.placement, format: isVideo ? "MP4" : "PNG", destination_id: meta.destination_id,
    talent: meta.talent.trim() || null, note: meta.note.trim() || null, uploaded_by_email: email, size_bytes: file.size, mime_type: file.type, is_sample: false,
  });
  return error?.message ?? null;
}
export async function removeMedia(m: MediaItem) {
  if (!supabase) return "Supabase is not connected in this build.";
  if (m.file_path) await supabase.storage.from("media").remove([m.file_path]);
  const { error } = await supabase.from("media").delete().eq("id", m.id);
  return error?.message ?? null;
}

export type Draft = {
  id: string; created_at: string; created_by_email: string | null; made_by: string; destination_id: string | null; source_campaign_id: string | null;
  name: string; daily_budget: number | null; objective: string | null; audience: string | null; placements: string | null;
  primary_texts: string[]; headlines: string[]; media_ids: string[]; reasoning: string | null; status: string; result_note: string | null; decided_by_email: string | null; model: string | null;
};
export async function fetchDrafts(): Promise<Draft[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("campaign_drafts").select("*").neq("status", "discarded").order("created_at", { ascending: false }).limit(40);
  return (data ?? []) as Draft[];
}
export async function saveDraft(d: Partial<Draft> & { name: string }, email: string) {
  if (!supabase) return "Supabase is not connected in this build.";
  const { error } = d.id
    ? await supabase.from("campaign_drafts").update({ name: d.name, daily_budget: d.daily_budget ?? null, source_campaign_id: d.source_campaign_id ?? null, status: d.status ?? "draft" }).eq("id", d.id)
    : await supabase.from("campaign_drafts").insert({ name: d.name, daily_budget: d.daily_budget ?? null, source_campaign_id: d.source_campaign_id ?? null, destination_id: d.destination_id ?? null, made_by: "person", created_by_email: email });
  return error?.message ?? null;
}
export async function mira(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; note?: string }> {
  if (!supabase) return { ok: false, error: "Supabase is not connected in this build." };
  const { data, error } = await supabase.functions.invoke("campaign-planner", { body });
  if (error && !data) return { ok: false, error: error.message };
  return (data ?? { ok: false, error: "No answer." }) as { ok: boolean; error?: string; note?: string };
}
