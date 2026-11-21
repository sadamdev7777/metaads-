// Run campaign: builds a campaign and its ad set in Meta from the form on the Run campaign page.
// Everything is created PAUSED and only when a signed-in person presses Create. Nothing here runs on a schedule.
//   options - what the form needs from the ad account: pixels, saved audiences, the page the ads run under.
//   source  - the settings of an ad set and the words of ads that already run, so they can be copied.
//   search  - look up interests, places and languages in Meta's own lists.
//   write   - Mira writes ad text options from facts she is given (AI).
//   create  - creates the campaign (or uses an existing one) and one ad set. Ads are added by ad-create.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const GRAPH = "https://graph.facebook.com/v27.0";
type Row = Record<string, unknown>;
const arr = (v: unknown) => (Array.isArray(v) ? (v as Row[]) : v && typeof v === "object" ? (Object.values(v as Row) as Row[]) : []);
const str = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);
const cents = (v: unknown) => Math.round(Number(v) * 100);

const OBJECTIVES = ["OUTCOME_LEADS", "OUTCOME_SALES", "OUTCOME_TRAFFIC", "OUTCOME_AWARENESS"];
const GOALS: Record<string, string[]> = {
  OUTCOME_LEADS: ["OFFSITE_CONVERSIONS", "LANDING_PAGE_VIEWS", "LINK_CLICKS"],
  OUTCOME_SALES: ["OFFSITE_CONVERSIONS", "LANDING_PAGE_VIEWS", "LINK_CLICKS"],
  OUTCOME_TRAFFIC: ["LANDING_PAGE_VIEWS", "LINK_CLICKS"],
  OUTCOME_AWARENESS: ["REACH", "IMPRESSIONS"],
};
const BIDS = ["LOWEST_COST_WITHOUT_CAP", "COST_CAP", "LOWEST_COST_WITH_BID_CAP"];
const ATTRIBUTION: Record<string, Row[]> = {
  "7c1v": [{ event_type: "CLICK_THROUGH", window_days: 7 }, { event_type: "VIEW_THROUGH", window_days: 1 }, { event_type: "ENGAGED_VIDEO_VIEW", window_days: 1 }],
  "7c": [{ event_type: "CLICK_THROUGH", window_days: 7 }],
  "1c": [{ event_type: "CLICK_THROUGH", window_days: 1 }],
};
const MAX_DAILY = 2000; // RM. A typing slip should not become a huge budget, even paused.
// Parts of a copied audience that Meta reports back but does not accept when creating.
const READ_ONLY = /^(age_range|page_types|dt_consolidation_state|targeting_optimization|user_age_unknown|brand_safety_content_filter_levels|targeting_relaxation_types|effective_.*)$/;
const PLACEMENT_KEYS = ["publisher_platforms", "facebook_positions", "instagram_positions", "messenger_positions", "audience_network_positions", "threads_positions", "whatsapp_positions", "device_platforms"];

const COPY_SYSTEM = `You are Mira, the copywriter for Muslimtravelbug (MTB), a Malaysian travel agency selling Muslim-friendly group tour packages with Facebook and Instagram ads. Readers are Malaysian Muslims. Write in natural Bahasa Melayu as used in Malaysian travel ads: warm, clear, specific, easy to read on a phone.

You are given a destination, notes from staff, departures from the booking system, ad texts that already bring cheap leads (as a guide to what works here), and lessons from the analyst's notebook. Write 3 different options, each with its own angle.

Rules:
- Use only facts you are given. Never invent a price, discount, date, hotel, itinerary item, number of seats or anything "free". If staff gave no price, do not mention a price.
- No false urgency and no claims you cannot support.
- Follow the shape of the winning texts where it helps: a strong first line, short paragraphs, what is included as a short list, then how to enquire. Do not copy their sentences.
- If the winning texts end with office or link lines, keep that closing block exactly as it appears there.
- Headline: at most 40 characters. Description: at most 30 characters, or empty.
- angle: 3 to 6 English words saying what this option leans on, so staff can choose quickly.
Submit your answer with the submit_copy tool.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: who, error: whoErr } = await userClient.auth.getUser();
  if (whoErr || !who.user) return json({ ok: false, error: "Sign in first." }, 401);
  const email = who.user.email ?? "";
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = (await req.json().catch(() => ({}))) as Row;
  const secret = async (name: string) => {
    const { data } = await admin.rpc("get_integration_secret", { p_name: name });
    return typeof data === "string" && data.length >= 20 ? data : null;
  };

  /* ---------- Mira writes ad text ---------- */
  if (body.action === "write") {
    const key = await secret("anthropic_api_key");
    if (!key) return json({ ok: false, error: "Connect the AI model in Settings, Integrations first." });
    const { data: integ } = await admin.from("integration_status").select("config").eq("key", "ai_model").maybeSingle();
    const cfg = (integ?.config ?? {}) as { model?: string; agents?: Record<string, string> };
    const model = cfg.agents?.planner || cfg.model;
    if (!model) return json({ ok: false, error: "No model chosen for Mira. Open Settings, Integrations." });
    const destId = str(body.destination_id, 60);
    const { data: dest } = destId ? await admin.from("destinations").select("id, name, country").eq("id", destId).maybeSingle() : { data: null };
    const [deps, lessons] = await Promise.all([
      dest ? admin.from("crm_departures").select("package_name, departure_date, seats_available").eq("destination_id", dest.id).gte("departure_date", new Date().toISOString().slice(0, 10)).order("departure_date").limit(20) : Promise.resolve({ data: [] }),
      admin.from("ai_learnings").select("lesson, agent").eq("is_active", true).in("agent", ["creative", "analyst", "staff"]).order("id", { ascending: false }).limit(30),
    ]);
    const brief = {
      destination: dest ? { name: dest.name, country: dest.country } : null,
      notes_from_staff: str(body.notes, 1200) || null,
      link: str(body.link, 300) || null,
      departures_in_booking_system: deps.data ?? [],
      winning_ad_texts: arr(body.references).slice(0, 3).map((r) => ({ ad: str(r.ad, 120), headline: str(r.title, 200), text: str(r.message, 2500) })),
      notebook: (lessons.data ?? []).map((l) => l.lesson),
    };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 6000, system: COPY_SYSTEM, tool_choice: { type: "auto" },
        tools: [{
          name: "submit_copy", description: "Submit the three ad text options.",
          input_schema: { type: "object", required: ["options"], properties: { options: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", required: ["angle", "primary_text", "headline"], properties: { angle: { type: "string" }, primary_text: { type: "string" }, headline: { type: "string" }, description: { type: "string" } } } } } },
        }],
        messages: [{ role: "user", content: `Write the options from this, then call submit_copy.\n\n${JSON.stringify(brief)}` }],
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return json({ ok: false, error: String(out?.error?.message ?? `The AI model answered with status ${res.status}`) });
    const tool = ((out.content ?? []) as Row[]).find((b) => b.type === "tool_use");
    const options = arr((tool?.input as Row | undefined)?.options).map((o) => ({ angle: str(o.angle, 80), primary_text: str(o.primary_text, 4000), headline: str(o.headline, 120), description: str(o.description, 80) })).filter((o) => o.primary_text);
    if (out.stop_reason === "max_tokens" || options.length === 0) return json({ ok: false, error: "Mira's answer did not come back complete. Try again." });
    await admin.from("activity_log").insert({ user_id: who.user.id, user_email: email, action: `Asked Mira for ad text${dest ? ` for ${dest.name}` : ""}`, area: "Run campaign" });
    return json({ ok: true, options, model });
  }

  /* ---------- Everything below talks to Meta ---------- */
  const token = await secret("meta_access_token");
  if (!token) return json({ ok: false, error: "Meta Ads is not connected." });
  const { data: st } = await admin.from("integration_status").select("config").eq("key", "meta_ads").maybeSingle();
  const cfg = (st?.config ?? {}) as { selected?: string[]; ad_account_id?: string };
  const account = String(cfg.selected?.[0] ?? cfg.ad_account_id ?? "").replace(/^act_/, "");
  if (!account) return json({ ok: false, error: "No ad account is chosen in Settings, Integrations." });
  const auth = { Authorization: `Bearer ${token}` };
  const fail = (out: Row, res: Response) => {
    const e = (out.error ?? {}) as Row;
    const msg = String(e.error_user_msg ?? e.message ?? `Meta answered with status ${res.status}`);
    const err = new Error(e.error_user_title && !msg.includes(String(e.error_user_title)) ? `${e.error_user_title}: ${msg}` : msg) as Error & { code?: number; subcode?: number };
    err.code = Number(e.code ?? 0);
    err.subcode = Number(e.error_subcode ?? 0);
    return err;
  };
  const get = async (path: string) => {
    const res = await fetch(`${GRAPH}/${path}`, { headers: auth });
    const out = (await res.json().catch(() => ({}))) as Row;
    if (!res.ok || out.error) throw fail(out, res);
    return out;
  };
  const send = async (path: string, payload: Row, method = "POST") => {
    const res = await fetch(`${GRAPH}/${path}`, { method, headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const out = (await res.json().catch(() => ({}))) as Row;
    if (!res.ok || out.error) throw fail(out, res);
    return out;
  };
  const say = (e: unknown) => {
    const m = e instanceof Error ? e.message : String(e);
    const c = (e as { code?: number }).code;
    if (c === 17 || /too many calls|request limit/i.test(m)) return "Meta is asking us to slow down (too many requests from this ad account). Wait a few minutes and try again.";
    return m;
  };
  // Reads what one ad shows: page, words, link, button and its picture or video.
  const readAd = async (metaAdId: string) => {
    const out = await get(`${metaAdId}?fields=name,creative{id,object_story_spec,url_tags,thumbnail_url}`);
    const c = (out.creative ?? {}) as Row;
    const spec = (c.object_story_spec ?? null) as Row | null;
    if (!spec) return { creative_id: str(c.id, 40), kind: "other", thumb: str(c.thumbnail_url, 1200), copyable: false } as Row;
    const link = (spec.link_data ?? {}) as Row;
    const video = (spec.video_data ?? {}) as Row;
    const cta = ((link.call_to_action ?? video.call_to_action) ?? {}) as Row;
    const value = (cta.value ?? {}) as Row;
    return {
      creative_id: str(c.id, 40), copyable: true, kind: spec.video_data ? "video" : "image", thumb: str(c.thumbnail_url, 1200),
      page_id: str(spec.page_id, 40), instagram_user_id: str(spec.instagram_user_id, 40),
      message: String(link.message ?? video.message ?? ""), title: String(link.name ?? video.title ?? ""), description: String(link.description ?? video.link_description ?? ""),
      link: String(link.link ?? value.link ?? ""), cta: String(cta.type ?? "LEARN_MORE"), url_tags: str(c.url_tags, 500),
      image_hash: str(link.image_hash ?? video.image_hash, 80), video_id: str(video.video_id, 40),
    } as Row;
  };
  // Meta now wants every ad set aimed at Malaysia to name the verified advertiser. Reuse what recent ad sets declare.
  const compliance = async (fromAdSet?: string) => {
    const pick = (x: Row) => (x.regional_regulation_identities && Object.keys(x.regional_regulation_identities as Row).length ? { regional_regulated_categories: x.regional_regulated_categories ?? [], regional_regulation_identities: x.regional_regulation_identities } : null);
    const f = "regional_regulated_categories,regional_regulation_identities";
    if (fromAdSet) {
      const own = pick(await get(`${fromAdSet}?fields=${f}`).catch(() => ({})));
      if (own) return own;
    }
    const list = await get(`act_${account}/adsets?fields=${f}&limit=60`).catch(() => ({ data: [] }));
    for (const x of arr(list.data)) {
      const got = pick(x);
      if (got) return got;
    }
    return null;
  };

  try {
    /* ---------- What the form needs from the ad account ---------- */
    if (body.action === "options") {
      const { data: w } = await admin.rpc("campaign_winners", { p_days: 30 });
      const topIds = arr((w as Row | null)?.ads).slice(0, 3).map((a) => String(a.id));
      const { data: topAds } = topIds.length ? await admin.from("ads").select("id, meta_ad_id").in("id", topIds) : { data: [] };
      let identity: Row | null = null;
      for (const id of topIds) {
        const meta = (topAds ?? []).find((a) => a.id === id)?.meta_ad_id;
        if (!meta) continue;
        const ad = await readAd(String(meta)).catch(() => null);
        if (ad?.page_id) { identity = ad; break; }
      }
      const [pixels, audiences] = await Promise.all([
        get(`act_${account}/adspixels?fields=id,name&limit=50`).catch(() => ({ data: [] })),
        get(`act_${account}/customaudiences?fields=id,name,subtype,approximate_count_lower_bound&limit=200`).catch(() => ({ data: [] })),
      ]);
      // Can this connection make a brand new ad (new words or new media) for the page? Asked of Meta without creating anything.
      let creativeOk = true;
      let creativeError = "";
      if (identity?.page_id && (identity.image_hash || identity.video_id)) {
        const story: Row = { page_id: identity.page_id };
        if (identity.instagram_user_id) story.instagram_user_id = identity.instagram_user_id;
        if (identity.kind === "video") story.video_data = { video_id: identity.video_id, message: "check", image_hash: identity.image_hash, call_to_action: { type: "LEARN_MORE", value: { link: identity.link } } };
        else story.link_data = { link: identity.link, message: "check", image_hash: identity.image_hash };
        try {
          await send(`act_${account}/adcreatives`, { name: "check", object_story_spec: story, execution_options: ["validate_only"] });
        } catch (e) {
          const sub = (e as { subcode?: number }).subcode;
          if (sub === 3858749 || /page permission/i.test(String((e as Error).message))) {
            creativeOk = false;
            creativeError = "The Meta connection may place existing ads, but it is not allowed to make new ads for the Facebook Page yet. In Meta Business Settings, give the user or system user behind the token the “Create ads” permission on the Page (and the Instagram account), then try again. Until then, only “Use this ad as it is” works.";
          }
        }
      }
      return json({
        ok: true,
        identity: identity ? { page_id: identity.page_id, instagram_user_id: identity.instagram_user_id, url_tags: identity.url_tags, cta: identity.cta, link: identity.link } : null,
        pixels: arr(pixels.data).map((p) => ({ id: String(p.id), name: String(p.name ?? p.id) })),
        audiences: arr(audiences.data).map((a) => ({ id: String(a.id), name: String(a.name ?? a.id), kind: String(a.subtype ?? "").toLowerCase(), size: Number(a.approximate_count_lower_bound ?? 0) })),
        creative_ok: creativeOk, creative_error: creativeError,
      });
    }

    /* ---------- Copy from what already runs ---------- */
    if (body.action === "source") {
      const out: Row = { ok: true, ads: [] };
      if (body.ad_set_id) {
        const { data: s } = await admin.from("ad_sets").select("id, name, meta_adset_id").eq("id", String(body.ad_set_id)).maybeSingle();
        if (!s?.meta_adset_id) return json({ ok: false, error: "That ad set was not found. Sync with Meta and try again." });
        const m = await get(`${s.meta_adset_id}?fields=name,targeting,optimization_goal,bid_strategy,bid_amount,daily_budget,lifetime_budget,promoted_object,attribution_spec,campaign{objective,daily_budget,bid_strategy}`);
        const t = { ...((m.targeting ?? {}) as Row) };
        for (const k of Object.keys(t)) if (READ_ONLY.test(k)) delete t[k];
        const camp = (m.campaign ?? {}) as Row;
        const po = (m.promoted_object ?? {}) as Row;
        const at = arr(m.attribution_spec);
        out.ad_set = {
          id: s.id, name: s.name, targeting: t, goal: String(m.optimization_goal ?? ""), bid_strategy: String(m.bid_strategy ?? camp.bid_strategy ?? "LOWEST_COST_WITHOUT_CAP"),
          bid_amount: m.bid_amount ? Number(m.bid_amount) / 100 : null, daily_budget: m.daily_budget ? Number(m.daily_budget) / 100 : null,
          pixel_id: str(po.pixel_id, 40), event: str(po.custom_event_type, 60), objective: String(camp.objective ?? ""),
          campaign_budget: camp.daily_budget ? Number(camp.daily_budget) / 100 : null,
          attribution: at.some((a) => a.event_type === "VIEW_THROUGH") ? "7c1v" : at.some((a) => Number(a.window_days) === 1) ? "1c" : "7c",
        };
      }
      const ids = (Array.isArray(body.ad_ids) ? body.ad_ids : []).map(String).slice(0, 6);
      if (ids.length) {
        const { data: rows } = await admin.from("ads").select("id, name, meta_ad_id").in("id", ids);
        const list: Row[] = [];
        for (const id of ids) {
          const r = (rows ?? []).find((x) => x.id === id);
          if (!r?.meta_ad_id) continue;
          try { list.push({ id: r.id, ad: r.name, ...(await readAd(String(r.meta_ad_id))) }); } catch (e) { list.push({ id: r.id, ad: r.name, copyable: false, error: say(e) }); }
        }
        out.ads = list;
      }
      return json(out);
    }

    /* ---------- Look up interests, places, languages ---------- */
    if (body.action === "search") {
      const q = encodeURIComponent(str(body.q, 60));
      if (!q) return json({ ok: true, results: [] });
      if (body.type === "interest") {
        const r = await get(`search?type=adinterest&q=${q}&limit=12`);
        return json({ ok: true, results: arr(r.data).map((x) => ({ id: String(x.id), name: String(x.name), note: `${Math.round(Number(x.audience_size_lower_bound ?? 0) / 1e6)}M+ people worldwide` })) });
      }
      if (body.type === "place") {
        const r = await get(`search?type=adgeolocation&q=${q}&location_types=${encodeURIComponent('["country","region","city"]')}&limit=12`);
        return json({ ok: true, results: arr(r.data).map((x) => ({ id: String(x.key), name: String(x.name), kind: String(x.type), country: String(x.country_code ?? ""), note: [x.type, x.region, x.country_name].filter(Boolean).join(", ") })) });
      }
      if (body.type === "language") {
        const r = await get(`search?type=adlocale&q=${q}&limit=12`);
        return json({ ok: true, results: arr(r.data).map((x) => ({ id: String(x.key), name: String(x.name) })) });
      }
      return json({ ok: false, error: "Unknown search." }, 400);
    }

    /* ---------- Create the campaign and its ad set, paused ---------- */
    if (body.action === "create") {
      const c = (body.campaign ?? {}) as Row;
      const s = (body.ad_set ?? {}) as Row;
      const a = (s.audience ?? {}) as Row;
      const existing = c.mode === "existing";
      let metaCampaign = "";
      let campaignRow: Row | null = null;
      let objective = str(c.objective, 40);
      let campaignBudget = false;

      if (existing) {
        const { data } = await admin.from("campaigns").select("id, name, meta_campaign_id, objective, daily_budget, destination_id").eq("id", str(c.id, 60)).maybeSingle();
        if (!data?.meta_campaign_id) return json({ ok: false, error: "Choose the campaign to add the ad set to." });
        campaignRow = data;
        metaCampaign = String(data.meta_campaign_id);
        const live = await get(`${metaCampaign}?fields=objective,daily_budget,lifetime_budget`);
        objective = String(live.objective ?? data.objective ?? "");
        campaignBudget = Boolean(live.daily_budget || live.lifetime_budget);
      } else {
        if (!str(c.name)) return json({ ok: false, error: "Give the campaign a name." });
        if (!OBJECTIVES.includes(objective)) return json({ ok: false, error: "Choose an objective." });
        campaignBudget = c.budget_level === "campaign";
      }
      const goal = str(s.goal, 40);
      if (!(GOALS[objective] ?? []).includes(goal)) return json({ ok: false, error: `That result (${goal || "none"}) does not fit this campaign's objective. Choose another in step 3.` });
      if (!str(s.name)) return json({ ok: false, error: "Give the ad set a name." });
      const bidStrategy = BIDS.includes(str(existing ? s.bid_strategy : campaignBudget ? c.bid_strategy : s.bid_strategy, 40)) ? str(existing ? s.bid_strategy : campaignBudget ? c.bid_strategy : s.bid_strategy, 40) : "LOWEST_COST_WITHOUT_CAP";
      const capped = bidStrategy !== "LOWEST_COST_WITHOUT_CAP";
      if (capped && !(Number(s.bid_amount) > 0)) return json({ ok: false, error: "This bid strategy needs an amount: the cost per result you aim for, or the bid cap." });
      const budget = Number(campaignBudget && !existing ? c.daily_budget : s.budget);
      const lifetime = !campaignBudget && s.budget_type === "lifetime";
      if (!(campaignBudget && existing)) {
        if (!(budget >= 5)) return json({ ok: false, error: "Enter a budget of at least RM5." });
        if (!lifetime && budget > MAX_DAILY) return json({ ok: false, error: `A daily budget above RM${MAX_DAILY} cannot be set here. If that is really intended, set it in Ads Manager.` });
      }
      const iso = (v: unknown) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(v ?? "")) ? `${String(v).slice(0, 16)}:00+0800` : "");
      const start = iso(s.start);
      const end = iso(s.end);
      if (lifetime && !end) return json({ ok: false, error: "A lifetime budget needs an end date." });
      if (end && new Date(end) <= new Date(start || Date.now())) return json({ ok: false, error: "The end date must be after the start." });

      // The audience: what was copied, with what the form controls laid over it.
      const t: Row = {};
      for (const [k, v] of Object.entries((a.base ?? {}) as Row)) if (!READ_ONLY.test(k) && !PLACEMENT_KEYS.includes(k)) t[k] = v;
      const baseGeo = (t.geo_locations ?? {}) as Row;
      const geo: Row = {};
      if (baseGeo.location_types) geo.location_types = baseGeo.location_types;
      const countries = (Array.isArray(a.countries) ? a.countries : []).map((x) => String(x).toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));
      const regions = arr(a.regions).map((x) => ({ key: String(x.id) }));
      const cities = arr(a.cities).map((x) => ({ key: String(x.id), radius: Math.min(80, Math.max(17, Number(x.radius) || 25)), distance_unit: "kilometer" }));
      if (countries.length) geo.countries = countries;
      if (regions.length) geo.regions = regions;
      if (cities.length) geo.cities = cities;
      if (!countries.length && !regions.length && !cities.length) return json({ ok: false, error: "Choose at least one place to show the ads in." });
      t.geo_locations = geo;
      const advantage = a.advantage !== false;
      let ageMin = Math.min(65, Math.max(18, Math.round(Number(a.age_min) || 18)));
      let ageMax = Math.min(65, Math.max(ageMin, Math.round(Number(a.age_max) || 65)));
      if (advantage) { ageMin = Math.min(ageMin, 25); ageMax = 65; }
      t.age_min = ageMin;
      t.age_max = ageMax;
      delete t.genders;
      if (!advantage && a.gender === "male") t.genders = [1];
      if (!advantage && a.gender === "female") t.genders = [2];
      const locales = arr(a.locales).map((x) => Number(x.id)).filter((n) => n > 0);
      if (locales.length) t.locales = locales; else delete t.locales;
      const flex = arr(t.flexible_spec).map((g) => { const { interests: _drop, ...rest } = g; return rest; }).filter((g) => Object.keys(g).length);
      const interests = arr(a.interests).map((x) => ({ id: String(x.id), name: String(x.name) }));
      if (interests.length) flex.unshift({ interests });
      if (flex.length) t.flexible_spec = flex; else delete t.flexible_spec;
      const inc = arr(a.include).map((x) => ({ id: String(x.id) }));
      const exc = arr(a.exclude).map((x) => ({ id: String(x.id) }));
      if (inc.length) t.custom_audiences = inc; else delete t.custom_audiences;
      if (exc.length) t.excluded_custom_audiences = exc; else delete t.excluded_custom_audiences;
      t.targeting_automation = { advantage_audience: advantage ? 1 : 0 };
      const pl = (a.placements ?? {}) as Row;
      const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter((x) => /^[a-z_]+$/.test(x)) : []);
      if (pl.mode === "core") {
        t.publisher_platforms = ["facebook", "instagram"];
        t.facebook_positions = ["feed", "story", "facebook_reels"];
        t.instagram_positions = ["stream", "story", "reels"];
      } else if (pl.mode === "manual") {
        const platforms = list(pl.platforms);
        if (!platforms.length) return json({ ok: false, error: "Manual placements: tick at least one platform." });
        t.publisher_platforms = platforms;
        if (platforms.includes("facebook") && list(pl.facebook).length) t.facebook_positions = list(pl.facebook);
        if (platforms.includes("instagram") && list(pl.instagram).length) t.instagram_positions = list(pl.instagram);
        if (list(pl.devices).length === 1) t.device_platforms = list(pl.devices);
      }

      const adset: Row = { name: str(s.name, 200), status: "PAUSED", billing_event: "IMPRESSIONS", optimization_goal: goal, targeting: t };
      if (goal === "OFFSITE_CONVERSIONS") {
        if (!str(s.pixel_id) || !str(s.event)) return json({ ok: false, error: "Choose the pixel and the event that counts as a result." });
        adset.promoted_object = { pixel_id: str(s.pixel_id, 40), custom_event_type: str(s.event, 60) };
        adset.attribution_spec = ATTRIBUTION[str(s.attribution, 10)] ?? ATTRIBUTION["7c1v"];
      } else if (objective === "OUTCOME_AWARENESS" && str(body.page_id)) adset.promoted_object = { page_id: str(body.page_id, 40) };
      if (!campaignBudget) {
        adset[lifetime ? "lifetime_budget" : "daily_budget"] = cents(budget);
        adset.bid_strategy = bidStrategy;
      }
      if (capped) adset.bid_amount = cents(s.bid_amount);
      if (start) adset.start_time = start;
      if (end) adset.end_time = end;
      let sourceMeta = "";
      if (s.source_ad_set_id) {
        const { data: src } = await admin.from("ad_sets").select("meta_adset_id").eq("id", str(s.source_ad_set_id, 60)).maybeSingle();
        sourceMeta = String(src?.meta_adset_id ?? "");
      }
      const rules = await compliance(sourceMeta || undefined);
      if (rules) Object.assign(adset, rules);

      // 1. The campaign.
      let made = false;
      if (!existing) {
        const camp: Row = { name: str(c.name, 200), objective, status: "PAUSED", special_ad_categories: [], buying_type: "AUCTION" };
        if (campaignBudget) { camp.daily_budget = cents(budget); camp.bid_strategy = bidStrategy; }
        else camp.is_adset_budget_sharing_enabled = false;
        if (Number(c.spend_cap) >= 100) camp.spend_cap = cents(c.spend_cap);
        const r = await send(`act_${account}/campaigns`, camp);
        metaCampaign = String(r.id ?? "");
        if (!metaCampaign) throw new Error("Meta did not return the new campaign.");
        made = true;
      }
      // 2. The ad set. If Meta refuses it, a campaign made a moment ago is removed so nothing half-built is left behind.
      let metaAdSet = "";
      try {
        const r = await send(`act_${account}/adsets`, { ...adset, campaign_id: metaCampaign });
        metaAdSet = String(r.id ?? "");
        if (!metaAdSet) throw new Error("Meta did not return the new ad set.");
      } catch (e) {
        let left = "";
        if (made) {
          try { await send(metaCampaign, {}, "DELETE"); left = " Nothing was left in Meta."; } catch { left = ` An empty paused campaign “${str(c.name, 200)}” was left in Meta: delete it in Ads Manager.`; }
        }
        await admin.from("ads_actions").insert({ kind: "create", level: "adset", entity_id: null, meta_id: metaCampaign || null, entity_name: `${existing ? campaignRow?.name : str(c.name, 200)} > ${str(s.name, 200)}`, before: {}, after: {}, ok: false, error: say(e).slice(0, 900), by_email: email });
        return json({ ok: false, error: `Meta did not accept the ad set: ${say(e)}${left}` });
      }

      // 3. Remember both here, so the pages show them before the next sync.
      const now = new Date().toISOString();
      let campaignId = String(campaignRow?.id ?? "");
      const destId = str(c.destination_id, 60) || null;
      if (!existing) {
        const { data: dest } = destId ? await admin.from("destinations").select("country").eq("id", destId).maybeSingle() : { data: null };
        const { data: row } = await admin.from("campaigns").upsert({
          meta_campaign_id: metaCampaign, name: str(c.name, 200), delivery_status: "PAUSED", objective, source: "system", is_sample: false, synced_at: now,
          daily_budget: campaignBudget ? budget : null, destination_id: destId, destination_manual: Boolean(destId), country: dest?.country ?? null, tagged_by_email: destId ? email : null,
        }, { onConflict: "meta_campaign_id" }).select("id").single();
        campaignId = String(row?.id ?? "");
        if (!destId) await admin.rpc("apply_destinations");
        await admin.from("ads_actions").insert({ kind: "create", level: "campaign", entity_id: campaignId || null, meta_id: metaCampaign, entity_name: str(c.name, 200), before: {}, after: { status: "PAUSED", objective, daily_budget: campaignBudget ? budget : null }, ok: true, by_email: email });
      }
      const { data: setRow } = await admin.from("ad_sets").insert({ meta_adset_id: metaAdSet, campaign_id: campaignId, name: str(s.name, 200), daily_budget: campaignBudget || lifetime ? null : budget, delivery_status: "PAUSED", is_sample: false, synced_at: now }).select("id").single();
      const campaignName = existing ? String(campaignRow?.name) : str(c.name, 200);
      await admin.from("ads_actions").insert({ kind: "create", level: "adset", entity_id: setRow?.id ?? null, meta_id: metaAdSet, entity_name: `${campaignName} > ${str(s.name, 200)}`, before: {}, after: { status: "PAUSED", goal, budget: campaignBudget ? null : budget, lifetime }, ok: true, by_email: email });
      await admin.from("activity_log").insert({ user_id: who.user.id, user_email: email, action: existing ? `Added ad set “${str(s.name, 200)}” to “${campaignName}” in Meta, paused` : `Created campaign “${campaignName}” with ad set “${str(s.name, 200)}” in Meta, paused`, area: "Run campaign" });
      return json({ ok: true, campaign_id: campaignId, ad_set_id: setRow?.id ?? null, meta_campaign_id: metaCampaign, meta_adset_id: metaAdSet, note: `${existing ? "Ad set added" : "Campaign and ad set created"} in Meta, paused.${rules ? "" : " No advertiser declaration was found to copy: Meta may ask for it before the ads can run."}` });
    }
    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (e) {
    return json({ ok: false, error: say(e) });
  }
});
