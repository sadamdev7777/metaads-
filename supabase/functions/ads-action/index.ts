// Adam, the Ads Manager. Makes ONE change in Meta at a time, only when a signed-in person asks: an approved
// proposal, or a direct pause, turn-on or daily budget change from the campaign page. Nothing here runs
// on a schedule. Every change is recorded with the state before and after, and a pause can be undone.
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
type Row = Record<string, unknown>;
const TABLE: Record<string, { table: string; meta: string }> = {
  campaign: { table: "campaigns", meta: "meta_campaign_id" },
  ad_set: { table: "ad_sets", meta: "meta_adset_id" },
  ad: { table: "ads", meta: "meta_ad_id" },
};

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
  // Only active staff can change ads. Raising a budget also needs the "can approve budget raises" right.
  const { data: me } = await admin.from("profiles").select("active, role, can_approve_budget").eq("id", who.user.id).maybeSingle();
  if (!me?.active) return json({ ok: false, error: "Your access is turned off. Ask an admin." }, 403);
  const mayRaise = me.role === "admin" || Boolean(me.can_approve_budget);

  const { data: tokenData } = await admin.rpc("get_integration_secret", { p_name: "meta_access_token" });
  const token = typeof tokenData === "string" && tokenData.length >= 20 ? tokenData : null;
  if (!token) return json({ ok: false, error: "Meta Ads is not connected." });
  const auth = { Authorization: `Bearer ${token}` };
  const read = async (metaId: string) => {
    const res = await fetch(`${GRAPH}/${metaId}?fields=name,status,effective_status,daily_budget`, { headers: auth });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.error) throw new Error(String(out?.error?.message ?? `Meta answered with status ${res.status}`));
    return { name: out.name ?? null, status: out.status ?? null, effective_status: out.effective_status ?? null, daily_budget: out.daily_budget == null ? null : Number(out.daily_budget) / 100 };
  };
  // Meta now wants an ad set aimed at Malaysia to name its verified advertiser before its budget or status can change.
  // Older ad sets do not have it, so it is copied from a recent ad set that does, and the change is sent again once.
  let declared: Record<string, string> | null | undefined;
  const declaration = async () => {
    if (declared !== undefined) return declared;
    declared = null;
    const { data: st } = await admin.from("integration_status").select("config").eq("key", "meta_ads").maybeSingle();
    const cfg = (st?.config ?? {}) as { selected?: string[]; ad_account_id?: string };
    const account = String(cfg.selected?.[0] ?? cfg.ad_account_id ?? "").replace(/^act_/, "");
    if (!account) return declared;
    const res = await fetch(`${GRAPH}/act_${account}/adsets?fields=regional_regulated_categories,regional_regulation_identities&limit=60`, { headers: auth });
    const out = await res.json().catch(() => ({}));
    for (const x of (out?.data ?? []) as Row[]) {
      if (x.regional_regulation_identities && Object.keys(x.regional_regulation_identities as Row).length) {
        declared = { regional_regulated_categories: JSON.stringify(x.regional_regulated_categories ?? []), regional_regulation_identities: JSON.stringify(x.regional_regulation_identities) };
        break;
      }
    }
    return declared;
  };
  const write = async (metaId: string, fields: Record<string, string>) => {
    const send = async (f: Record<string, string>) => {
      const res = await fetch(`${GRAPH}/${metaId}`, { method: "POST", headers: auth, body: new URLSearchParams(f) });
      const out = await res.json().catch(() => ({}));
      return { res, out };
    };
    let { res, out } = await send(fields);
    if ((!res.ok || out.error) && Number(out?.error?.error_subcode) === 3858634) {
      const d = await declaration();
      if (d) ({ res, out } = await send({ ...fields, ...d }));
    }
    if (!res.ok || out.error) {
      const msg = String(out?.error?.error_user_msg ?? out?.error?.message ?? `Meta answered with status ${res.status}`);
      throw new Error(/permission|not authorized|\(#10\)|\(#200\)/i.test(msg) ? `The Meta token is not allowed to change ads: ${msg}` : msg);
    }
  };
  const mirror = async (level: string, entityId: string | null, state: { effective_status: unknown; daily_budget: unknown }) => {
    if (!entityId) return;
    const fields: Row = { delivery_status: state.effective_status };
    if (level !== "ad") fields.daily_budget = state.daily_budget;
    await admin.from(TABLE[level].table).update(fields).eq("id", entityId);
  };

  /* ---------- Undo a pause ---------- */
  if (body.action === "undo") {
    const { data: a } = await admin.from("ads_actions").select("*").eq("id", Number(body.action_id)).maybeSingle();
    if (!a || !a.ok) return json({ ok: false, error: "That action was not found." });
    if (a.undone_at) return json({ ok: false, error: "Already undone." });
    if (a.kind !== "pause") return json({ ok: false, error: "Only a pause can be undone here. Change a budget back in Approvals with a new amount, or in Ads Manager." });
    try {
      await write(a.meta_id, { status: "ACTIVE" });
      const now = await read(a.meta_id);
      await mirror(a.level, a.entity_id, now);
      await admin.from("ads_actions").update({ undone_at: new Date().toISOString(), undone_by_email: email }).eq("id", a.id);
      await admin.from("activity_log").insert({ user_id: who.user.id, user_email: email, action: `Undid pause: turned ${a.entity_name ?? a.meta_id} back on in Meta`, area: "Approvals" });
      return json({ ok: true, state: now });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  /* ---------- A direct change from the campaign page ---------- */
  if (body.action === "direct") {
    const level = String(body.level ?? "");
    const kind = String(body.kind ?? "");
    if (!TABLE[level] || !["pause", "activate", "budget"].includes(kind)) return json({ ok: false, error: "Unknown change." }, 400);
    const { data: ent } = await admin.from(TABLE[level].table).select("*").eq("id", String(body.id ?? "")).maybeSingle();
    const metaId = ent ? String(ent[TABLE[level].meta] ?? "") : "";
    if (!ent || !metaId) return json({ ok: false, error: "That item was not found. Sync with Meta and try again." });
    const { data: rules } = await admin.from("rules").select("max_budget_increase_pct, max_actions_per_day").limit(1).maybeSingle();
    const maxPerDay = Number(rules?.max_actions_per_day ?? 20);
    const maxRaisePct = Number(rules?.max_budget_increase_pct ?? 30);
    const { count: recent } = await admin.from("ads_actions").select("id", { count: "exact", head: true }).eq("ok", true).gte("created_at", new Date(Date.now() - 24 * 3600000).toISOString());
    if ((recent ?? 0) >= maxPerDay) return json({ ok: false, error: `The limit of ${maxPerDay} changes in 24 hours has been reached. Change it in Settings, Rules.` });
    const what = level.replace("_", " ");
    let before: Awaited<ReturnType<typeof read>> | null = null;
    try {
      before = await read(metaId);
      let fields: Record<string, string>;
      let summary: string;
      if (kind === "pause") {
        fields = { status: "PAUSED" };
        summary = `Paused ${what} “${before.name}” in Meta`;
      } else if (kind === "activate") {
        fields = { status: "ACTIVE" };
        summary = `Turned on ${what} “${before.name}” in Meta`;
      } else {
        if (level === "ad") return json({ ok: false, error: "An ad has no budget of its own. Change the budget on its ad set or campaign." });
        if (before.daily_budget == null) return json({ ok: false, error: `This ${what} has no daily budget of its own. The budget is set on the ${level === "ad_set" ? "campaign" : "ad sets"}.` });
        const next = Math.round(Number(body.new_daily_budget) * 100) / 100;
        if (!Number.isFinite(next) || next < 5) return json({ ok: false, error: "Enter the new daily budget in RM (at least RM5)." });
        if (next > before.daily_budget && !mayRaise) return json({ ok: false, error: "Raising a budget needs an admin, or someone given that right in Settings, Users." });
        const limit = before.daily_budget * (1 + maxRaisePct / 100);
        if (next > limit + 0.001) return json({ ok: false, error: `That is more than ${maxRaisePct}% above the current RM${before.daily_budget}. The most allowed in one step is RM${Math.floor(limit)}.` });
        fields = { daily_budget: String(Math.round(next * 100)) };
        summary = `Changed the daily budget of ${what} “${before.name}” from RM${before.daily_budget} to RM${next} in Meta`;
      }
      await write(metaId, fields);
      const after = await read(metaId);
      await admin.from("ads_actions").insert({ kind, level, entity_id: ent.id, meta_id: metaId, entity_name: before.name ?? String(ent.name ?? ""), before, after, ok: true, by_email: email });
      await mirror(level, String(ent.id), after);
      await admin.from("activity_log").insert({ user_id: who.user.id, user_email: email, action: summary, area: "Approvals" });
      const held = kind === "activate" && after.effective_status !== "ACTIVE" ? ` It is on, but not delivering yet (${String(after.effective_status ?? "").toLowerCase().replace(/_/g, " ")}): check that its campaign and ad set are on.` : "";
      return json({ ok: true, note: `${summary}.${held}`, before, after });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await admin.from("ads_actions").insert({ kind, level, entity_id: ent.id, meta_id: metaId, entity_name: before?.name ?? String(ent.name ?? ""), before: before ?? {}, after: {}, ok: false, error: message, by_email: email });
      return json({ ok: false, error: message });
    }
  }

  if (body.action !== "apply") return json({ ok: false, error: "Unknown action." }, 400);

  /* ---------- Apply one approved proposal ---------- */
  const { data: p } = await admin.from("proposals").select("*").eq("id", String(body.proposal_id ?? "")).maybeSingle();
  if (!p) return json({ ok: false, error: "Proposal not found." });
  if (p.status === "applied") return json({ ok: false, error: "This proposal was already applied." });
  if (!["pending", "approved"].includes(p.status)) return json({ ok: false, error: `This proposal is ${p.status} and cannot be applied.` });

  const type = String(p.action_type ?? "").toLowerCase();
  const kind = /turn off|pause|stop/.test(type) ? "pause" : /raise|lower|increase|decrease|reduce/.test(type) && !/move/.test(type) ? "budget" : null;
  if (!kind) return json({ ok: false, manual: true, error: "This kind of proposal cannot be applied automatically. Approve it and make the change in Ads Manager." });
  if (kind === "budget" && /raise|increase/.test(type) && !mayRaise) return json({ ok: false, error: "Raising a budget needs an admin, or someone given that right in Settings, Users." });

  // Find the thing in Meta: by the id the analyst gave, or by the names in the target.
  let level = ["campaign", "ad_set", "ad"].includes(p.entity_level) ? String(p.entity_level) : "";
  let entity: Row | null = null;
  if (level && p.entity_id) {
    const { data } = await admin.from(TABLE[level].table).select("*").eq("id", p.entity_id).maybeSingle();
    entity = data;
  }
  if (!entity) {
    const parts = String(p.target ?? "").split(">").map((x) => x.trim()).filter(Boolean);
    const { data: camps } = await admin.from("campaigns").select("*").eq("name", parts[0] ?? "").eq("is_sample", false).limit(2);
    if (camps?.length === 1) {
      if (parts.length === 1) { level = "campaign"; entity = camps[0]; }
      else {
        const { data: sets } = await admin.from("ad_sets").select("*").eq("campaign_id", camps[0].id).eq("name", parts[1]).limit(2);
        if (sets?.length === 1) {
          if (parts.length === 2) { level = "ad_set"; entity = sets[0]; }
          else {
            const { data: adsFound } = await admin.from("ads").select("*").eq("ad_set_id", sets[0].id).eq("name", parts[2]).limit(2);
            if (adsFound?.length === 1) { level = "ad"; entity = adsFound[0]; }
          }
        }
      }
    }
  }
  const metaId = entity && level ? String(entity[TABLE[level].meta] ?? "") : "";
  if (!entity || !metaId) return json({ ok: false, manual: true, error: "Could not tell exactly which campaign, ad set or ad this is. Approve it and make the change in Ads Manager." });

  // Safety limits from Settings, Rules. Defaults apply while they are not set.
  const { data: rules } = await admin.from("rules").select("max_budget_increase_pct, max_actions_per_day").limit(1).maybeSingle();
  const maxPerDay = Number(rules?.max_actions_per_day ?? 20);
  const maxRaisePct = Number(rules?.max_budget_increase_pct ?? 30);
  const since = new Date(Date.now() - 24 * 3600000).toISOString();
  const { count: recent } = await admin.from("ads_actions").select("id", { count: "exact", head: true }).eq("ok", true).gte("created_at", since);
  if ((recent ?? 0) >= maxPerDay) return json({ ok: false, error: `The limit of ${maxPerDay} changes in 24 hours has been reached. Change it in Settings, Rules, or make this change in Ads Manager.` });

  let before: Awaited<ReturnType<typeof read>> | null = null;
  let targetLevel = level;
  let targetEntity = entity;
  let targetMeta = metaId;
  const record = async (ok: boolean, after: Row, error?: string) => {
    await admin.from("ads_actions").insert({
      proposal_id: p.id, kind, level: targetLevel, entity_id: targetEntity.id, meta_id: targetMeta, entity_name: before?.name ?? String(targetEntity.name ?? ""),
      before: before ?? {}, after, ok, error: error ?? null, by_email: email,
    });
  };

  try {
    before = await read(targetMeta);
    let fields: Record<string, string>;
    let summary: string;
    if (kind === "pause") {
      if (before.status === "PAUSED") {
        await admin.from("proposals").update({ status: "applied", decided_by: who.user.id, decided_by_email: email, decided_at: new Date().toISOString(), applied_at: new Date().toISOString(), apply_note: "Already paused in Meta. Nothing was changed." }).eq("id", p.id);
        await mirror(targetLevel, String(targetEntity.id), before);
        return json({ ok: true, note: "It was already paused in Meta. Nothing was changed." });
      }
      fields = { status: "PAUSED" };
      summary = `Paused ${targetLevel.replace("_", " ")} “${before.name}” in Meta`;
    } else {
      // A budget sits on the ad set, or on the campaign when the campaign shares one budget.
      if (targetLevel === "ad") {
        const { data: s } = await admin.from("ad_sets").select("*").eq("id", targetEntity.ad_set_id).maybeSingle();
        if (!s) throw new Error("Could not find the ad set of this ad.");
        targetLevel = "ad_set"; targetEntity = s; targetMeta = String(s.meta_adset_id); before = await read(targetMeta);
      }
      if (targetLevel === "ad_set" && before.daily_budget == null) {
        const { data: c } = await admin.from("campaigns").select("*").eq("id", targetEntity.campaign_id).maybeSingle();
        if (!c) throw new Error("Could not find the campaign of this ad set.");
        targetLevel = "campaign"; targetEntity = c; targetMeta = String(c.meta_campaign_id); before = await read(targetMeta);
      }
      if (before.daily_budget == null) throw new Error("This campaign has no daily budget to change (it may use a lifetime budget). Change it in Ads Manager.");
      const next = Math.round(Number(body.new_daily_budget) * 100) / 100;
      if (!Number.isFinite(next) || next < 5) return json({ ok: false, need_budget: true, current: before.daily_budget, max: Math.floor(before.daily_budget * (1 + maxRaisePct / 100)), level: targetLevel, name: before.name, error: "Enter the new daily budget in RM (at least RM5)." });
      if (next > before.daily_budget && !mayRaise) return json({ ok: false, error: "Raising a budget needs an admin, or someone given that right in Settings, Users." });
      const limit = before.daily_budget * (1 + maxRaisePct / 100);
      if (next > limit + 0.001) return json({ ok: false, need_budget: true, current: before.daily_budget, max: Math.floor(limit), level: targetLevel, name: before.name, error: `That is more than ${maxRaisePct}% above the current RM${before.daily_budget}. The most allowed in one step is RM${Math.floor(limit)}.` });
      fields = { daily_budget: String(Math.round(next * 100)) };
      summary = `Changed the daily budget of ${targetLevel.replace("_", " ")} “${before.name}” from RM${before.daily_budget} to RM${next} in Meta`;
    }

    await write(targetMeta, fields);
    const after = await read(targetMeta);
    await record(true, after);
    await mirror(targetLevel, String(targetEntity.id), after);
    await admin.from("proposals").update({ status: "applied", decided_by: who.user.id, decided_by_email: email, decided_at: new Date().toISOString(), applied_at: new Date().toISOString(), apply_note: summary }).eq("id", p.id);
    await admin.from("activity_log").insert({ user_id: who.user.id, user_email: email, action: `${summary} (approved proposal)`, area: "Approvals" });
    return json({ ok: true, note: summary, before, after });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await record(false, {}, message);
    return json({ ok: false, error: message });
  }
});
