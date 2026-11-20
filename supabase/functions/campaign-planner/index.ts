// Mira, the Campaign Planner. Two jobs, both started by a signed-in person:
//   draft  - writes a campaign draft for a destination from Luqman's lessons and the figures (AI).
//   launch - creates the campaign in Meta by copying an existing campaign. Everything is created PAUSED,
//            so nothing spends money until a person turns it on in Ads Manager.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const GRAPH = "https://graph.facebook.com/v27.0";
const MAX_ADS = 40;
type Row = Record<string, unknown>;

const SYSTEM = `You are Mira, the campaign planner for Muslimtravelbug (MTB), a Malaysian travel agency that sells Muslim-friendly group tour packages through Facebook and Instagram ads. Customers are Malaysian Muslims; ads are written in Bahasa Melayu.

You are given one destination, its recent campaigns and ads with results, the analyst's notebook of lessons, the TravelCRM packages for the destination, and the media library. Draft ONE new campaign.

How a campaign is made here: the system copies an existing campaign (its ad sets, targeting, pixel and ads) and creates the copy paused. Staff then swap in the new copy and creative in Ads Manager and turn it on. So you must choose which existing campaign to copy, and write the new copy.

Rules:
- Name the campaign "Country - Destination D/M - Mira", using the destination name given and today's date.
- Choose source_campaign_id from the campaigns listed: prefer the one with the lowest cost per lead on meaningful spend (about RM150 or more). If none has enough data, choose the most recent and say so.
- Suggest a daily budget in RM close to what similar campaigns here actually spend per day. Do not exceed the highest daily budget you can see in the data by more than 30 percent.
- Write 3 primary texts and 3 headlines in natural Bahasa Melayu as used in Malaysian travel ads: warm, clear, specific. Use only facts you are given (package names, dates, seats). Never invent a price, a discount, an itinerary detail, a hotel, a date or a number of seats. If you have no price, do not mention a price. No false urgency.
- Pick media_ids only from the media library given. If it is empty, return an empty list and say what creative is needed.
- Use the notebook: apply lessons that fit and say which ones you used.
- Leads here are Meta leads. Deposits are known only by destination, not by ad. Do not claim any ad produced deposits.

Reply with one JSON object and nothing else:
{"name": "...", "source_campaign_id": "id from the data or null", "daily_budget": 0, "objective": "short", "audience": "who to target and why, 1-3 sentences", "placements": "short", "primary_texts": ["...", "...", "..."], "headlines": ["...", "...", "..."], "media_ids": ["id"], "reasoning": "3-6 sentences: why this source, this budget, this angle, and which lessons were used"}`;

function extractJson(text: string): Row | null {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: who, error: whoErr } = await userClient.auth.getUser();
  if (whoErr || !who.user) return json({ ok: false, error: "Sign in first." }, 401);
  const email = who.user.email ?? "";
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = (await req.json().catch(() => ({}))) as Row;
  const secret = async (name: string) => {
    const { data } = await admin.rpc("get_integration_secret", { p_name: name });
    return typeof data === "string" && data.length >= 20 ? data : null;
  };
  const log = (action: string) => admin.from("activity_log").insert({ user_id: who.user.id, user_email: email, action, area: "New campaign" });

  /* ---------- Draft with AI ---------- */
  if (body.action === "draft") {
    const key = await secret("anthropic_api_key");
    if (!key) return json({ ok: false, error: "Connect the AI model in Settings, Integrations first." });
    const { data: integ } = await admin.from("integration_status").select("config").eq("key", "ai_model").maybeSingle();
    const cfg = (integ?.config ?? {}) as { model?: string; agents?: Record<string, string> };
    const model = cfg.agents?.planner || cfg.model;
    if (!model) return json({ ok: false, error: "No model chosen for Mira. Open Settings, Integrations." });

    const { data: dest } = await admin.from("destinations").select("*").eq("id", String(body.destination_id ?? "")).maybeSingle();
    if (!dest) return json({ ok: false, error: "Choose a destination." });

    const [c30, a30, lessons, pk, lib] = await Promise.all([
      admin.rpc("campaign_overview", { p_days: 30 }),
      admin.rpc("ad_overview", { p_days: 30, p_limit: 400 }),
      admin.from("ai_learnings").select("lesson, evidence, confidence").eq("is_active", true).order("id", { ascending: false }).limit(60),
      admin.from("crm_departures").select("package_name, departure_date, seats_available").eq("destination_id", dest.id).gte("departure_date", new Date().toISOString().slice(0, 10)).order("departure_date").limit(30),
      admin.from("media").select("id, file_name, placement, format, talent, note").eq("destination_id", dest.id).eq("is_sample", false).limit(60),
    ]);
    const camps = ((c30.data ?? []) as Row[]).filter((c) => c.destination_id === dest.id)
      .map((c) => ({ id: c.id, name: c.name, status: c.delivery_status, daily_budget: c.daily_budget, spend_30d: c.spend, leads_30d: c.leads, run_by: c.run_by, created: c.meta_created_at }));
    if (camps.length === 0) return json({ ok: false, error: `There is no earlier campaign for ${dest.name} to copy from. Create the first one in Ads Manager, or use "Copy a campaign" with a similar destination.` });
    const names = new Set(camps.map((c) => String(c.name)));
    const ads = ((a30.data ?? []) as Row[]).filter((a) => names.has(String(a.campaign)))
      .map((a) => ({ campaign: a.campaign, ad_set: a.ad_set, ad: a.ad, status: a.status, spend: a.spend, leads: a.leads, clicks: a.clicks }));
    const others = ((c30.data ?? []) as Row[]).filter((c) => c.daily_budget != null && (c.delivery_status === "ACTIVE" || Number(c.spend) > 0))
      .map((c) => Number(c.daily_budget));
    const brief = {
      today_malaysia: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
      destination: { name: dest.name, country: dest.country },
      notes_from_staff: String(body.notes ?? "").slice(0, 600) || null,
      campaigns_for_this_destination: camps,
      ads_for_this_destination_last_30_days: ads,
      highest_daily_budget_in_account: others.length ? Math.max(...others) : null,
      travelcrm_packages: pk.data ?? [],
      media_library: lib.data ?? [],
      analyst_notebook: lessons.data ?? [],
    };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 3000, system: SYSTEM, messages: [{ role: "user", content: `Draft the campaign from this data.\n\n${JSON.stringify(brief)}` }] }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return json({ ok: false, error: String(out?.error?.message ?? `Anthropic answered with status ${res.status}`) });
    const text = ((out.content ?? []) as Row[]).filter((b) => b.type === "text").map((b) => String(b.text)).join("");
    const d = extractJson(text);
    if (!d || typeof d.name !== "string") return json({ ok: false, error: "Mira's answer could not be read. Nothing was saved." });

    const source = camps.find((c) => c.id === d.source_campaign_id) ?? null;
    const libIds = new Set(((lib.data ?? []) as Row[]).map((m) => String(m.id)));
    const strs = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v : []).map((x) => String(x).slice(0, max)).filter(Boolean).slice(0, n);
    const { data: saved, error } = await admin.from("campaign_drafts").insert({
      created_by_email: email, made_by: "mira", destination_id: dest.id, source_campaign_id: source?.id ?? null,
      name: d.name.slice(0, 200), daily_budget: Number(d.daily_budget) > 0 ? Math.round(Number(d.daily_budget)) : null,
      objective: d.objective ? String(d.objective).slice(0, 200) : null, audience: d.audience ? String(d.audience).slice(0, 1000) : null,
      placements: d.placements ? String(d.placements).slice(0, 300) : null,
      primary_texts: strs(d.primary_texts, 5, 2000), headlines: strs(d.headlines, 5, 200),
      media_ids: strs(d.media_ids, 10, 60).filter((id) => libIds.has(id)), reasoning: d.reasoning ? String(d.reasoning).slice(0, 2500) : null, model,
    }).select("id").single();
    if (error || !saved) return json({ ok: false, error: `Could not save the draft: ${error?.message}` });
    await log(`Asked Mira to draft a campaign for ${dest.name}`);
    return json({ ok: true, draft_id: saved.id });
  }

  /* ---------- Create in Meta, paused, by copying a campaign ---------- */
  if (body.action === "launch") {
    const token = await secret("meta_access_token");
    if (!token) return json({ ok: false, error: "Meta Ads is not connected." });
    const { data: draft } = await admin.from("campaign_drafts").select("*").eq("id", String(body.draft_id ?? "")).maybeSingle();
    if (!draft) return json({ ok: false, error: "Draft not found." });
    if (draft.status !== "draft" && draft.status !== "failed") return json({ ok: false, error: `This draft is already ${draft.status}.` });
    if (!draft.source_campaign_id) return json({ ok: false, error: "Choose which campaign to copy first." });
    const { data: src } = await admin.from("campaigns").select("*").eq("id", draft.source_campaign_id).maybeSingle();
    if (!src?.meta_campaign_id) return json({ ok: false, error: "The campaign to copy was not found." });

    const auth = { Authorization: `Bearer ${token}` };
    const get = async (path: string) => {
      const res = await fetch(`${GRAPH}/${path}`, { headers: auth });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.error) throw new Error(String(out?.error?.message ?? `Meta answered with status ${res.status}`));
      return out;
    };
    const post = async (path: string, fields: Record<string, string>) => {
      const res = await fetch(`${GRAPH}/${path}`, { method: "POST", headers: auth, body: new URLSearchParams(fields) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.error) {
        const msg = String(out?.error?.error_user_msg ?? out?.error?.message ?? `Meta answered with status ${res.status}`);
        throw new Error(/permission|not authorized|\(#10\)|\(#200\)/i.test(msg) ? `The Meta token is not allowed to create ads: ${msg}` : msg);
      }
      return out as Row;
    };
    const keep = (x: Row) => !["ARCHIVED", "DELETED"].includes(String(x.effective_status));
    const noRename = JSON.stringify({ rename_strategy: "NO_RENAME" });
    let newCampaign = "";
    const done = { ad_sets: 0, ads: 0 };
    const problems: string[] = [];
    try {
      const sets = ((await get(`${src.meta_campaign_id}/adsets?fields=id,name,effective_status&limit=100`)).data as Row[]).filter(keep);
      const adsAll = ((await get(`${src.meta_campaign_id}/ads?fields=id,name,adset_id,effective_status&limit=300`)).data as Row[]).filter(keep);
      if (adsAll.length > MAX_ADS) return json({ ok: false, error: `That campaign has ${adsAll.length} ads. Copying more than ${MAX_ADS} here is not supported: duplicate it in Ads Manager.` });

      const c = await post(`${src.meta_campaign_id}/copies`, { deep_copy: "false", status_option: "PAUSED", rename_options: noRename });
      newCampaign = String(c.copied_campaign_id ?? c.id ?? "");
      if (!newCampaign) throw new Error("Meta did not return the new campaign.");
      await post(newCampaign, { name: String(draft.name), status: "PAUSED" });

      for (const s of sets) {
        try {
          const cs = await post(`${s.id}/copies`, { campaign_id: newCampaign, deep_copy: "false", status_option: "PAUSED", rename_options: noRename });
          const newSet = String(cs.copied_adset_id ?? cs.id ?? "");
          if (!newSet) throw new Error("no ad set returned");
          done.ad_sets += 1;
          for (const a of adsAll.filter((x) => x.adset_id === s.id)) {
            try {
              await post(`${a.id}/copies`, { adset_id: newSet, status_option: "PAUSED", rename_options: noRename });
              done.ads += 1;
            } catch (e) {
              problems.push(`Ad “${a.name}”: ${e instanceof Error ? e.message : e}`);
            }
          }
        } catch (e) {
          problems.push(`Ad set “${s.name}”: ${e instanceof Error ? e.message : e}`);
        }
      }

      let budgetNote = "";
      if (draft.daily_budget && src.daily_budget != null) {
        try {
          await post(newCampaign, { daily_budget: String(Math.round(Number(draft.daily_budget) * 100)) });
          budgetNote = ` Daily budget set to RM${draft.daily_budget}.`;
        } catch (e) {
          problems.push(`Budget: ${e instanceof Error ? e.message : e}`);
        }
      } else if (draft.daily_budget) budgetNote = " Budgets are on the ad sets and were copied as they were: set them in Ads Manager.";

      const note = `Created paused in Meta as a copy of “${src.name}”: ${done.ad_sets} ad set${done.ad_sets === 1 ? "" : "s"}, ${done.ads} ad${done.ads === 1 ? "" : "s"}.${budgetNote}${problems.length ? ` ${problems.length} item${problems.length === 1 ? "" : "s"} could not be copied: ${problems.slice(0, 4).join("; ")}` : ""}`;
      await admin.from("campaign_drafts").update({ status: "created", meta_campaign_id: newCampaign, result_note: note.slice(0, 2000), decided_by_email: email, decided_at: new Date().toISOString() }).eq("id", draft.id);
      await admin.from("campaigns").upsert({ meta_campaign_id: newCampaign, name: draft.name, delivery_status: "PAUSED", objective: src.objective, source: "system", is_sample: false, synced_at: new Date().toISOString() }, { onConflict: "meta_campaign_id" });
      await admin.rpc("apply_destinations");
      await log(`Created campaign “${draft.name}” in Meta, paused, as a copy of “${src.name}”`);
      return json({ ok: true, note, meta_campaign_id: newCampaign, problems });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const note = newCampaign ? `Stopped part way: ${message}. A paused campaign was created in Meta (${done.ad_sets} ad sets, ${done.ads} ads copied). Check it in Ads Manager.` : `Nothing was created in Meta: ${message}`;
      await admin.from("campaign_drafts").update({ status: newCampaign ? "created" : "failed", meta_campaign_id: newCampaign || null, result_note: note.slice(0, 2000), decided_by_email: email, decided_at: new Date().toISOString() }).eq("id", draft.id);
      await log(`Creating campaign “${draft.name}” in Meta failed${newCampaign ? " part way" : ""}`);
      return json({ ok: false, error: note });
    }
  }

  return json({ ok: false, error: "Unknown action." }, 400);
});
