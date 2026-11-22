// Alila's ad schedule: the rules staff set, what she changed, and what she suggests.
import { supabase } from "./supabase";

export type SchedRule = {
  id: string; name: string; enabled: boolean; kind: "weekly" | "dates"; days: number[]; time_from: string | null; time_to: string | null;
  starts_at: string | null; ends_at: string | null; action: "pause" | "budget"; percent: number | null;
  scope: "all" | "country" | "destination" | "campaigns"; scope_values: string[]; skip_until: string | null; created_by_email: string | null;
};
export type RuleDraft = Omit<SchedRule, "id" | "skip_until" | "created_by_email"> & { id?: string; from_suggestion?: number | null };
export type SchedSettings = { enabled: boolean; dry_run: boolean; last_tick_at: string | null; last_tick_note: string | null; last_review_at: string | null; last_review: string | null };
export type SchedChange = { id: number; rule_id: string | null; rule_name: string | null; campaign_id: string | null; level: string; entity_name: string | null; kind: string; before: { daily_budget?: number }; after: { daily_budget?: number }; dry_run: boolean; applied_at: string; restored_at: string | null; restore_note: string | null; attempts: number; last_error: string | null };
export type SchedSuggestion = { id: number; created_at: string; title: string; why: string | null; numbers: string | null; rule: Partial<RuleDraft>; status: string };

export const DAYS = [{ v: 1, t: "Mon" }, { v: 2, t: "Tue" }, { v: 3, t: "Wed" }, { v: 4, t: "Thu" }, { v: 5, t: "Fri" }, { v: 6, t: "Sat" }, { v: 7, t: "Sun" }];
export const blankRule = (): RuleDraft => ({ name: "", enabled: true, kind: "weekly", days: [7], time_from: null, time_to: null, starts_at: null, ends_at: null, action: "budget", percent: 50, scope: "all", scope_values: [] });

const hm = (t: string | null) => (t ? t.slice(0, 5) : "");
const nice = (s: string | null) => (s ? new Date(`${s.slice(0, 16)}:00+08:00`).toLocaleString("en-MY", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }) : "?");
/** When a rule applies, in words. */
export function whenText(r: Pick<SchedRule, "kind" | "days" | "time_from" | "time_to" | "starts_at" | "ends_at">): string {
  if (r.kind === "dates") return `${nice(r.starts_at)} to ${nice(r.ends_at)}`;
  const days = r.days.length === 7 ? "Every day" : DAYS.filter((d) => r.days.includes(d.v)).map((d) => d.t).join(", ") || "No day chosen";
  if (!r.time_from && !r.time_to) return `${days}, all day`;
  const past = r.time_from && r.time_to && r.time_to <= r.time_from ? " the next day" : "";
  return `${days}, ${hm(r.time_from) || "00:00"} to ${hm(r.time_to) || "midnight"}${past}`;
}
export const doesText = (r: Pick<SchedRule, "action" | "percent">) => (r.action === "pause" ? "Pause" : `Lower daily budget by ${r.percent ?? 50}%`);

/** Is the rule in force at this moment? Same reading of the clock as Alila's own. */
export function inForce(r: SchedRule, now = new Date()): boolean {
  if (!r.enabled || (r.skip_until && new Date(r.skip_until) > now)) return false;
  const local = new Date(now.getTime() + 8 * 3600_000);
  if (r.kind === "dates") return Boolean(r.starts_at && r.ends_at && local >= new Date(`${r.starts_at.slice(0, 19)}Z`) && local < new Date(`${r.ends_at.slice(0, 19)}Z`));
  const m = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
  const from = m(r.time_from) ?? 0;
  const to = m(r.time_to);
  const cur = local.getUTCHours() * 60 + local.getUTCMinutes();
  const today = local.getUTCDay() || 7;
  const yesterday = today === 1 ? 7 : today - 1;
  if (to === null) return r.days.includes(today) && cur >= from;
  if (to > from) return r.days.includes(today) && cur >= from && cur < to;
  return (r.days.includes(today) && cur >= from) || (r.days.includes(yesterday) && cur < to);
}

export async function fetchSchedule(): Promise<{ settings: SchedSettings | null; rules: SchedRule[]; open: SchedChange[]; recent: SchedChange[]; suggestions: SchedSuggestion[] }> {
  if (!supabase) return { settings: null, rules: [], open: [], recent: [], suggestions: [] };
  const [s, r, o, c, g] = await Promise.all([
    supabase.from("ad_schedule_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("ad_schedule_rules").select("*").order("created_at"),
    supabase.from("ad_schedule_changes").select("*").is("restored_at", null).order("id", { ascending: false }).limit(300),
    supabase.from("ad_schedule_changes").select("*").not("restored_at", "is", null).order("restored_at", { ascending: false }).limit(40),
    supabase.from("ad_schedule_suggestions").select("*").eq("status", "pending").order("id"),
  ]);
  return { settings: (s.data ?? null) as SchedSettings | null, rules: (r.data ?? []) as SchedRule[], open: (o.data ?? []) as SchedChange[], recent: (c.data ?? []) as SchedChange[], suggestions: (g.data ?? []) as SchedSuggestion[] };
}
export async function saveSettings(patch: Partial<Pick<SchedSettings, "enabled" | "dry_run">>, email: string): Promise<string | null> {
  if (!supabase) return "Supabase is not connected in this build.";
  const { error } = await supabase.from("ad_schedule_settings").update({ ...patch, updated_at: new Date().toISOString(), updated_by_email: email }).eq("id", 1);
  return error?.message ?? null;
}
export async function saveRule(d: RuleDraft, email: string): Promise<string | null> {
  if (!supabase) return "Supabase is not connected in this build.";
  const weekly = d.kind === "weekly";
  const row = {
    name: d.name.trim(), enabled: d.enabled, kind: d.kind, days: weekly ? [...d.days].sort() : [], time_from: weekly ? d.time_from || null : null, time_to: weekly ? d.time_to || null : null,
    starts_at: weekly ? null : d.starts_at, ends_at: weekly ? null : d.ends_at, action: d.action, percent: d.action === "budget" ? d.percent ?? 50 : null,
    scope: d.scope, scope_values: d.scope === "all" ? [] : d.scope_values, skip_until: null, updated_at: new Date().toISOString(),
  };
  const { error } = d.id ? await supabase.from("ad_schedule_rules").update(row).eq("id", d.id) : await supabase.from("ad_schedule_rules").insert({ ...row, created_by_email: email, from_suggestion: d.from_suggestion ?? null });
  if (!error && d.from_suggestion) await supabase.from("ad_schedule_suggestions").update({ status: "accepted", decided_by_email: email, decided_at: new Date().toISOString() }).eq("id", d.from_suggestion);
  return error?.message ?? null;
}
export async function toggleRule(id: string, enabled: boolean): Promise<string | null> {
  if (!supabase) return "Supabase is not connected in this build.";
  const { error } = await supabase.from("ad_schedule_rules").update({ enabled, skip_until: null, updated_at: new Date().toISOString() }).eq("id", id);
  return error?.message ?? null;
}
export async function removeRule(id: string): Promise<string | null> {
  if (!supabase) return "Supabase is not connected in this build.";
  const { error } = await supabase.from("ad_schedule_rules").delete().eq("id", id);
  return error?.message ?? null;
}
/** Staff turn a suggestion down, with the reason. Alila reads the reason next week. */
export async function dismissSuggestion(id: number, reason: string, email: string): Promise<string | null> {
  if (!supabase) return "Supabase is not connected in this build.";
  const { error } = await supabase.from("ad_schedule_suggestions").update({ status: "dismissed", decision_note: reason.trim() || null, decided_by_email: email, decided_at: new Date().toISOString() }).eq("id", id);
  return error?.message ?? null;
}
/** tick = apply the rules now; release = cancel a rule for the window in progress; study = ask Alila for suggestions. */
export async function schedule(body: { action: "tick" | "release" | "study"; rule_id?: string }): Promise<{ ok: boolean; error?: string; note?: string; summary?: string; suggestions?: number }> {
  if (!supabase) return { ok: false, error: "Supabase is not connected in this build." };
  const { data, error } = await supabase.functions.invoke("ad-schedule", { body });
  if (error && !data) return { ok: false, error: error.message };
  return data ?? { ok: false, error: "No answer." };
}
