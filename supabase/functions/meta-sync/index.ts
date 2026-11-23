// Pulls campaigns, ad sets, ads and daily spend from Meta into the database. It only reads:
// changes to Meta go through other functions. Runs hourly from the database, or when someone presses Sync now.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const GRAPH = "https://graph.facebook.com/v27.0";
type Row = Record<string, unknown>;

async function getAll(firstUrl: string, token: string, maxPages = 60): Promise<Row[]> {
  const out: Row[] = [];
  let url: string | null = firstUrl;
  for (let page = 0; url && page < maxPages; page++) {
    // Meta sometimes answers "temporarily unavailable" on heavy reports: wait and try again.
    let body: Row & { error?: { message?: string }; paging?: { next?: string } } = {};
    let failed = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 3000));
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      body = await res.json().catch(() => ({}));
      failed = !res.ok || body.error ? String(body?.error?.message ?? `Meta answered with status ${res.status}`) : "";
      if (!failed || !/temporar|unavailable|unknown error|try again|reduce/i.test(failed)) break;
    }
    if (failed) throw new Error(failed);
    out.push(...((body.data ?? []) as Row[]));
    url = body.paging?.next ?? null;
  }
  return out;
}
const chunks = <T>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const money = (v: unknown) => (v == null || v === "" ? null : Number(v) / 100);
const num = (v: unknown) => Math.round(Number(v ?? 0)) || 0;
function leadsOf(actions: unknown): number {
  const list = Array.isArray(actions) ? (actions as Row[]) : [];
  const pick = (type: string) => num(list.find((a) => a.action_type === type)?.value);
  return pick("lead") || pick("offsite_conversion.fb_pixel_lead") || pick("onsite_conversion.lead_grouped");
}
function clicksOf(actions: unknown): number {
  const list = Array.isArray(actions) ? (actions as Row[]) : [];
  return num(list.find((a) => a.action_type === "link_click")?.value);
}

// The database returns at most 1,000 rows per request, so id lookups are read page by page.
// deno-lint-ignore no-explicit-any
async function idMap(admin: any, table: string, metaCol: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(`id, ${metaCol}`).not(metaCol, "is", null).order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const r of data ?? []) map.set(String(r[metaCol]), String(r.id));
    if (!data || data.length < 1000) break;
  }
  return map;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const secret = async (name: string) => {
    const { data } = await admin.rpc("get_integration_secret", { p_name: name });
    return typeof data === "string" && data.length >= 20 ? data : null;
  };

  // Who is asking: the hourly job (key from Vault) or a signed-in person.
  let triggeredBy = "";
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey) {
    const expected = await secret("cron_key");
    if (!expected || cronKey !== expected) return json({ ok: false, error: "Not allowed." }, 401);
    triggeredBy = "schedule";
  } else {
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: who, error } = await userClient.auth.getUser();
    if (error || !who.user) return json({ ok: false, error: "Sign in first." }, 401);
    triggeredBy = who.user.email ?? "user";
  }

  const body = (await req.json().catch(() => ({}))) as Row;
  const days = Math.min(Math.max(Number(body.days) || 3, 1), 90);
  // skip_days moves the window back in time, so a long history can be loaded in several short runs.
  const skipDays = Math.min(Math.max(Number(body.skip_days) || 0, 0), 365);
  // structure: "all" reads every campaign, ad set and ad (once a day), "active" only the ones delivering
  // now (every hour, far fewer calls to Meta), false reads spend only.
  const scope = body.structure === false ? "none" : body.structure === "active" ? "active" : "all";
  const structure = scope !== "none";
  const only = scope === "active" ? `&filtering=${encodeURIComponent(JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }]))}` : "";

  const { data: integ } = await admin.from("integration_status").select("config").eq("key", "meta_ads").maybeSingle();
  const selected = ((integ?.config as { selected?: string[] } | null)?.selected ?? []) as string[];
  const token = await secret("meta_access_token");
  if (!token || selected.length === 0) return json({ ok: false, error: "Connect Meta Ads and select an ad account first." });

  const { data: run } = await admin.from("sync_runs").insert({ triggered_by: triggeredBy, summary: { days, skip_days: skipDays } }).select("id").single();
  const finish = async (ok: boolean, summary: Row, error?: string) => {
    if (run) await admin.from("sync_runs").update({ finished_at: new Date().toISOString(), ok, summary, error: error ?? null }).eq("id", run.id);
  };

  try {
    const now = new Date().toISOString();
    // Dates are Malaysia days, the ad account's time zone.
    const dayOf = (back: number) => new Date(Date.now() + 8 * 3600000 - back * 86400000).toISOString().slice(0, 10);
    const totals = { campaigns: 0, ad_sets: 0, ads: 0, spend_rows: 0, new_campaigns: 0, days, skip_days: skipDays, scope };

    for (const account of selected) {
      const act = `act_${account}`;
      const [mc, ms, ma] = !structure ? [[], [], []] as Row[][] : await Promise.all([
        getAll(`${GRAPH}/${act}/campaigns?fields=id,name,objective,effective_status,daily_budget,created_time&limit=500${only}`, token),
        getAll(`${GRAPH}/${act}/adsets?fields=id,name,campaign_id,effective_status,daily_budget&limit=500${only}`, token),
        getAll(`${GRAPH}/${act}/ads?fields=id,name,adset_id,effective_status&limit=500${only}`, token),
      ]);

      const before = await idMap(admin, "campaigns", "meta_campaign_id");
      totals.new_campaigns += mc.filter((c) => !before.has(String(c.id))).length;

      // Tags people add (product, country, run by) are never overwritten: those columns are not sent.
      for (const part of chunks(mc, 500)) {
        const { error } = await admin.from("campaigns").upsert(
          part.map((c) => ({
            meta_campaign_id: String(c.id), name: String(c.name ?? c.id), objective: c.objective ?? null,
            delivery_status: String(c.effective_status ?? "UNKNOWN"), daily_budget: money(c.daily_budget),
            meta_created_at: c.created_time ?? null, is_sample: false, synced_at: now, updated_at: now,
          })),
          { onConflict: "meta_campaign_id" },
        );
        if (error) throw new Error(`campaigns: ${error.message}`);
      }
      const cMap = await idMap(admin, "campaigns", "meta_campaign_id");

      // Hourly runs read active campaigns only, so one that was just paused would keep showing as
      // active. Ask Meta for the status of those few directly.
      if (scope === "active") {
        const seen = new Set(mc.map((c) => String(c.id)));
        const { data: wasActive } = await admin.from("campaigns").select("meta_campaign_id").eq("delivery_status", "ACTIVE").not("meta_campaign_id", "is", null).limit(1000);
        const stale = (wasActive ?? []).map((r) => String(r.meta_campaign_id)).filter((id) => !seen.has(id));
        for (const part of chunks(stale, 50)) {
          const res = await fetch(`${GRAPH}/?ids=${part.join(",")}&fields=effective_status`, { headers: { Authorization: `Bearer ${token}` } });
          const found = (await res.json().catch(() => ({}))) as Record<string, { effective_status?: string }>;
          for (const id of part) {
            const status = found?.[id]?.effective_status;
            if (status) await admin.from("campaigns").update({ delivery_status: status, synced_at: now, updated_at: now }).eq("meta_campaign_id", id);
          }
        }
      }

      for (const part of chunks(ms.filter((s) => cMap.has(String(s.campaign_id))), 500)) {
        const { error } = await admin.from("ad_sets").upsert(
          part.map((s) => ({
            meta_adset_id: String(s.id), campaign_id: cMap.get(String(s.campaign_id)), name: String(s.name ?? s.id),
            delivery_status: s.effective_status ?? null, daily_budget: money(s.daily_budget), is_sample: false, synced_at: now,
          })),
          { onConflict: "meta_adset_id" },
        );
        if (error) throw new Error(`ad sets: ${error.message}`);
      }
      const sMap = await idMap(admin, "ad_sets", "meta_adset_id");

      for (const part of chunks(ma.filter((a) => sMap.has(String(a.adset_id))), 500)) {
        const { error } = await admin.from("ads").upsert(
          part.map((a) => ({
            meta_ad_id: String(a.id), ad_set_id: sMap.get(String(a.adset_id)), name: String(a.name ?? a.id),
            delivery_status: a.effective_status ?? null, is_sample: false, synced_at: now,
          })),
          { onConflict: "meta_ad_id" },
        );
        if (error) throw new Error(`ads: ${error.message}`);
      }
      const aMap = await idMap(admin, "ads", "meta_ad_id");
      totals.campaigns += mc.length; totals.ad_sets += ms.filter((x) => cMap.has(String(x.campaign_id))).length; totals.ads += ma.filter((x) => sMap.has(String(x.adset_id))).length;

      // Daily spend at each level.
      const levels: [string, string, string, Map<string, string>][] = [
        ["campaign", "campaign", "campaign_id", cMap], ["ad_set", "adset", "adset_id", sMap], ["ad", "ad", "ad_id", aMap],
      ];
      // One day at a time keeps each report small enough for Meta to answer.
      for (let back = skipDays; back < skipDays + days; back++) for (const [level, metaLevel, idField, map] of levels) {
        const day = dayOf(back);
        const range = encodeURIComponent(JSON.stringify({ since: day, until: day }));
        const rows = await getAll(
          `${GRAPH}/${act}/insights?level=${metaLevel}&fields=${idField},spend,impressions,actions&time_increment=1&time_range=${range}&limit=500`,
          token, 40,
        );
        const mapped = rows.filter((r) => map.has(String(r[idField]))).map((r) => ({
          level, entity_id: map.get(String(r[idField])), spend_date: String(r.date_start),
          spend: Number(r.spend ?? 0), impressions: num(r.impressions), link_clicks: clicksOf(r.actions), meta_leads: leadsOf(r.actions),
        }));
        for (const part of chunks(mapped, 500)) {
          const { error } = await admin.from("ad_spend_daily").upsert(part, { onConflict: "level,entity_id,spend_date" });
          if (error) throw new Error(`spend: ${error.message}`);
        }
        totals.spend_rows += mapped.length;
      }
    }

    if (structure && totals.new_campaigns > 0 && totals.new_campaigns < totals.campaigns && triggeredBy === "schedule") {
      await admin.from("notifications").insert({
        kind: "found_in_meta",
        message: `${totals.new_campaigns} new campaign${totals.new_campaigns === 1 ? "" : "s"} found in Meta. Tag the country and who runs it.`,
        link: "/campaigns",
      });
    }
    await admin.from("integration_status").update({
      status: "connected", last_checked_at: now,
      ...(scope === "all" ? { detail: `Last sync ${now.slice(0, 16).replace("T", " ")} UTC: ${totals.campaigns} campaigns, ${totals.ad_sets} ad sets, ${totals.ads} ads.` } : {}),
    }).eq("key", "meta_ads");
    await finish(true, totals);
    return json({ ok: true, ...totals });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await finish(false, { days, skip_days: skipDays }, message);
    return json({ ok: false, error: message });
  }
});
