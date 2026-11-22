// Alila, the schedule keeper. The one part of the system that changes Meta by itself, and only in this way:
// during the hours and dates staff set in Settings, Ad schedule, she pauses campaigns or lowers daily budgets,
// and afterwards puts back only what she changed herself. She never creates, deletes or raises anything.
//   tick    - every 15 minutes: apply the rules that are in force now, put back what is no longer covered.
//   release - a person cancels a rule for the window in progress; everything it changed is put back.
//   study   - once a week (AI): she looks at results by weekday and at her own rules, and suggests changes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const GRAPH = "https://graph.facebook.com/v27.0";
type Row = Record<string, unknown>;
type Rule = { id: string; name: string; enabled: boolean; kind: string; days: number[]; time_from: string | null; time_to: string | null; starts_at: string | null; ends_at: string | null; action: string; percent: number | null; scope: string; scope_values: string[]; skip_until: string | null };
const ME = "Alila";
const MAX_CALLS = 150; // Meta requests in one run. The rest waits for the next run, 15 minutes later.
const MIN_BUDGET = 5; // RM a day. She never lowers a budget below this.
const HOUR = 3600_000;

// Malaysia has no daylight saving, so local time is always UTC+8. "Local" dates below are Dates whose UTC fields hold Malaysia time.
const toLocal = (d: Date) => new Date(d.getTime() + 8 * HOUR);
const fromLocal = (d: Date) => new Date(d.getTime() - 8 * HOUR);
const isoDay = (d: Date) => d.getUTCDay() || 7;
const minutes = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
const atMinute = (day: Date, m: number) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) + m * 60_000);

/** If the rule is in force at `local`, the local time its window ends. Otherwise null. */
function windowEnd(r: Rule, local: Date): Date | null {
  if (r.kind === "dates") {
    if (!r.starts_at || !r.ends_at) return null;
    const a = new Date(`${r.starts_at.slice(0, 19)}Z`);
    const b = new Date(`${r.ends_at.slice(0, 19)}Z`);
    return local >= a && local < b ? b : null;
  }
  const from = minutes(r.time_from) ?? 0;
  const to = minutes(r.time_to);
  const now = local.getUTCHours() * 60 + local.getUTCMinutes();
  const today = isoDay(local);
  const yesterday = today === 1 ? 7 : today - 1;
  const days = r.days ?? [];
  if (to === null || (r.time_from === null && r.time_to === null)) return days.includes(today) && now >= from ? atMinute(local, 24 * 60) : null;
  if (to > from) return days.includes(today) && now >= from && now < to ? atMinute(local, to) : null;
  if (days.includes(today) && now >= from) return atMinute(local, 24 * 60 + to); // runs past midnight
  if (days.includes(yesterday) && now < to) return atMinute(local, to);
  return null;
}

const STUDY_SYSTEM = `You are Alila, the schedule keeper for Muslimtravelbug (MTB), a Malaysian travel agency that sells group tours with Facebook and Instagram ads. Staff set rules in "Ad schedule": during set hours or dates you pause campaigns or lower daily budgets, then put them back. Once a week you study the numbers and suggest better rules. Staff decide; you never add a rule yourself.

You are given: results by weekday for the last 8 weeks, results day by day for 5 weeks, the rules in force, what your rules changed, your own notebook, and suggestions staff dismissed with their reasons.

How to think:
- A "lead" is a website enquiry counted by Meta. You do not know which day's leads became deposits. Never claim a day sells better or worse; speak only of spend, leads and cost per lead.
- Each weekday has only a few samples. Say so. Do not suggest a change on a difference smaller than about 15% in cost per lead, or on fewer than 4 days of that weekday.
- Lowering a budget is gentler than pausing: Meta keeps learning. Prefer it for ordinary weekly rules. Keep full pauses for closed days and long holidays.
- If spend on a day is already low, staff may be lowering it by hand: suggest a rule that does it for them, at about the level they already use.
- After a pause or a cut, look at the next day: if cost per lead jumped the day after, say so and suggest a softer rule.
- Do not invent public holidays or dates. Suggest a dated rule only if the data or the notes show a real date.
- Do not repeat a suggestion staff dismissed unless the numbers have clearly changed; if you do, say what changed.
- If nothing is worth changing, give no suggestions and say why in the summary. That is a good answer.

Write plain English a busy manager can read on a phone. Amounts in RM. Each suggestion needs: a short title, why (one or two sentences), the numbers it rests on, and the rule exactly as it would be saved. Lessons are things you want to remember next week (at most 3, only if new). Submit with the submit_review tool.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const secret = async (name: string) => {
    const { data } = await admin.rpc("get_integration_secret", { p_name: name });
    return typeof data === "string" && data.length >= 20 ? data : null;
  };
  let person = "";
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey) {
    const expected = await secret("cron_key");
    if (!expected || cronKey !== expected) return json({ ok: false, error: "Not allowed." }, 401);
  } else {
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data.user) return json({ ok: false, error: "Sign in first." }, 401);
    person = data.user.email ?? "user";
  }
  const body = (await req.json().catch(() => ({}))) as Row;
  const say = (text: string, area = "Ad schedule") => admin.from("activity_log").insert({ user_name: person ? null : ME, user_email: person || null, action: text, area });

  /* ---------- study: once a week she suggests better rules ---------- */
  if (body.action === "study") {
    const key = await secret("anthropic_api_key");
    if (!key) return json({ ok: false, error: "Connect the AI model in Settings, Integrations first." });
    const { data: integ } = await admin.from("integration_status").select("config").eq("key", "ai_model").maybeSingle();
    const cfg = (integ?.config ?? {}) as { model?: string; agents?: Record<string, string> };
    const model = cfg.agents?.planner || cfg.model;
    if (!model) return json({ ok: false, error: "No model chosen. Open Settings, Integrations." });
    const [stats, rules, notebook, dismissed] = await Promise.all([
      admin.rpc("ad_schedule_stats"),
      admin.from("ad_schedule_rules").select("name, enabled, kind, days, time_from, time_to, starts_at, ends_at, action, percent, scope"),
      admin.from("ai_learnings").select("lesson").eq("agent", "schedule").eq("is_active", true).order("id", { ascending: false }).limit(20),
      admin.from("ad_schedule_suggestions").select("title, rule, decision_note, decided_at").eq("status", "dismissed").order("id", { ascending: false }).limit(15),
    ]);
    const brief = { today: toLocal(new Date()).toISOString().slice(0, 10), weekdays: "1 = Monday … 7 = Sunday", ...((stats.data ?? {}) as Row), rules_now: rules.data ?? [], notebook: (notebook.data ?? []).map((l) => l.lesson), dismissed_by_staff: dismissed.data ?? [] };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 8000, system: STUDY_SYSTEM, tool_choice: { type: "auto" },
        tools: [{
          name: "submit_review", description: "Submit the weekly schedule review.",
          input_schema: {
            type: "object", required: ["summary", "suggestions", "lessons"],
            properties: {
              summary: { type: "string", description: "Two or three sentences: what the week shows." },
              suggestions: { type: "array", maxItems: 3, items: { type: "object", required: ["title", "why", "numbers", "rule"], properties: {
                title: { type: "string" }, why: { type: "string" }, numbers: { type: "string" },
                rule: { type: "object", required: ["name", "kind", "action"], properties: {
                  name: { type: "string" }, kind: { type: "string", enum: ["weekly", "dates"] }, days: { type: "array", items: { type: "integer", minimum: 1, maximum: 7 } },
                  time_from: { type: "string", description: "HH:MM, or empty for the whole day" }, time_to: { type: "string", description: "HH:MM, or empty for the whole day" },
                  starts_at: { type: "string", description: "YYYY-MM-DDTHH:MM, dates rules only" }, ends_at: { type: "string" },
                  action: { type: "string", enum: ["pause", "budget"] }, percent: { type: "integer", minimum: 10, maximum: 90, description: "For budget: lower by this percent." } } } } } },
              lessons: { type: "array", maxItems: 3, items: { type: "string" } },
            },
          },
        }],
        messages: [{ role: "user", content: `Study this, then call submit_review.\n\n${JSON.stringify(brief)}` }],
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return json({ ok: false, error: String(out?.error?.message ?? `The AI model answered with status ${res.status}`) });
    const tool = ((out.content ?? []) as Row[]).find((b) => b.type === "tool_use");
    const input = (tool?.input ?? null) as { summary?: string; suggestions?: Row[]; lessons?: string[] } | null;
    if (out.stop_reason === "max_tokens" || !input?.summary) return json({ ok: false, error: "Alila's review did not come back complete. Try again." });
    const clean = (r: Row): Row | null => {
      const kind = r.kind === "dates" ? "dates" : "weekly";
      const action = r.action === "pause" ? "pause" : "budget";
      const hm = (v: unknown) => (/^\d{2}:\d{2}/.test(String(v ?? "")) ? String(v).slice(0, 5) : null);
      const days = (Array.isArray(r.days) ? r.days : []).map(Number).filter((n) => n >= 1 && n <= 7);
      if (kind === "weekly" && days.length === 0) return null;
      const dt = (v: unknown) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(v ?? "")) ? String(v).slice(0, 16) : null);
      if (kind === "dates" && (!dt(r.starts_at) || !dt(r.ends_at))) return null;
      return { name: String(r.name ?? "Suggested rule").slice(0, 80), kind, days, time_from: hm(r.time_from), time_to: hm(r.time_to), starts_at: dt(r.starts_at), ends_at: dt(r.ends_at), action, percent: action === "budget" ? Math.min(90, Math.max(10, Number(r.percent) || 50)) : null, scope: "all", scope_values: [] };
    };
    const good = (input.suggestions ?? []).map((s) => ({ title: String(s.title ?? "").slice(0, 160), why: String(s.why ?? "").slice(0, 900), numbers: String(s.numbers ?? "").slice(0, 900), rule: clean((s.rule ?? {}) as Row) })).filter((s) => s.title && s.rule);
    await admin.from("ad_schedule_suggestions").update({ status: "replaced" }).eq("status", "pending");
    if (good.length) await admin.from("ad_schedule_suggestions").insert(good);
    const lessons = (input.lessons ?? []).map((l) => String(l).trim().slice(0, 500)).filter(Boolean).slice(0, 3);
    if (lessons.length) await admin.from("ai_learnings").insert(lessons.map((lesson) => ({ agent: "schedule", lesson, confidence: "Medium", is_active: true })));
    await admin.from("ad_schedule_settings").update({ last_review_at: new Date().toISOString(), last_review: String(input.summary).slice(0, 1500) }).eq("id", 1);
    await admin.from("activity_log").insert({ user_name: ME, action: `Reviewed the ad schedule: ${good.length} suggestion${good.length === 1 ? "" : "s"}`, area: "Ad schedule" });
    return json({ ok: true, suggestions: good.length, lessons: lessons.length, summary: input.summary });
  }

  if (body.action !== "tick" && body.action !== "release") return json({ ok: false, error: "Unknown action." }, 400);

  /* ---------- release: a person cancels a rule for the window in progress ---------- */
  const nowUtc = new Date();
  const local = toLocal(nowUtc);
  if (body.action === "release") {
    if (!person) return json({ ok: false, error: "Sign in first." }, 401);
    const { data: r } = await admin.from("ad_schedule_rules").select("*").eq("id", String(body.rule_id ?? "")).maybeSingle();
    if (!r) return json({ ok: false, error: "That rule was not found." });
    const end = windowEnd(r as Rule, local);
    if (!end) return json({ ok: false, error: "That rule is not in force right now." });
    await admin.from("ad_schedule_rules").update({ skip_until: fromLocal(end).toISOString() }).eq("id", r.id);
    await say(`Cancelled the schedule rule “${r.name}” for now: everything it changed is being put back`);
  }

  /* ---------- tick ---------- */
  const { data: settings } = await admin.from("ad_schedule_settings").select("*").eq("id", 1).maybeSingle();
  const on = Boolean(settings?.enabled);
  const dry = settings?.dry_run !== false;
  const { data: ruleRows } = await admin.from("ad_schedule_rules").select("*").eq("enabled", true);
  const active = on ? ((ruleRows ?? []) as Rule[]).filter((r) => (!r.skip_until || new Date(r.skip_until) <= nowUtc) && windowEnd(r, local)) : [];
  const { data: openRows } = await admin.from("ad_schedule_changes").select("*").is("restored_at", null).order("id");
  const open = (openRows ?? []) as Row[];
  if (active.length === 0 && open.length === 0) {
    await admin.from("ad_schedule_settings").update({ last_tick_at: nowUtc.toISOString(), last_tick_note: on ? "No rule in force." : "Switched off." }).eq("id", 1);
    return json({ ok: true, note: on ? "No rule in force." : "Switched off." });
  }

  // Meta, reached only when a real change is due.
  let calls = 0;
  let stop = "";
  let token: string | null = null;
  const meta = async (path: string, fields?: Record<string, string>) => {
    if (stop) throw new Error(stop);
    if (calls >= MAX_CALLS) { stop = "Reached this run's limit of requests to Meta. The rest follows in 15 minutes."; throw new Error(stop); }
    token ??= await secret("meta_access_token");
    if (!token) { stop = "Meta Ads is not connected."; throw new Error(stop); }
    calls++;
    const res = await fetch(`${GRAPH}/${path}`, fields ? { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: new URLSearchParams(fields) } : { headers: { Authorization: `Bearer ${token}` } });
    const out = (await res.json().catch(() => ({}))) as Row;
    if (!res.ok || out.error) {
      const e = (out.error ?? {}) as Row;
      const msg = String(e.error_user_msg ?? e.message ?? `Meta answered with status ${res.status}`);
      if (Number(e.code) === 17 || Number(e.code) === 4 || /too many calls|request limit/i.test(msg)) stop = "Meta asked us to slow down. The rest follows in 15 minutes.";
      throw new Error(msg);
    }
    return out;
  };
  const log = (kind: string, level: string, entityId: unknown, metaId: unknown, name: string, before: Row, after: Row, ok: boolean, error?: string) =>
    admin.from("ads_actions").insert({ kind, level, entity_id: entityId ?? null, meta_id: metaId ?? null, entity_name: name, before, after, ok, error: error?.slice(0, 900) ?? null, by_email: ME });
  const done = { applied: 0, restored: 0, left: 0, failed: 0 };

  // Which campaigns should be changed right now, and how. A pause outranks a budget cut; a bigger cut outranks a smaller one.
  const { data: campRows } = await admin.from("campaigns").select("id, name, meta_campaign_id, delivery_status, daily_budget, country, destination_id").eq("is_sample", false).not("meta_campaign_id", "is", null).eq("delivery_status", "ACTIVE").limit(2000);
  const inScope = (r: Rule, c: Row) => {
    const values = (Array.isArray(r.scope_values) ? r.scope_values : []).map(String);
    return r.scope === "all" || (r.scope === "country" && values.includes(String(c.country))) || (r.scope === "destination" && values.includes(String(c.destination_id))) || (r.scope === "campaigns" && values.includes(String(c.id)));
  };
  const want = new Map<string, { rule: Rule; camp: Row }>();
  for (const r of active) {
    for (const c of (campRows ?? []) as Row[]) {
      if (!inScope(r, c)) continue;
      const had = want.get(String(c.id));
      const stronger = !had || (r.action === "pause" && had.rule.action !== "pause") || (r.action === "budget" && had.rule.action === "budget" && (r.percent ?? 0) > (had.rule.percent ?? 0));
      if (stronger) want.set(String(c.id), { rule: r, camp: c });
    }
  }
  // Campaigns she already paused are no longer ACTIVE, so they are not in the list above. Read them by id to check they are still in scope.
  const stillActive = new Set(active.map((r) => r.id));
  const openIds = Array.from(new Set(open.map((c) => String(c.campaign_id))));
  const { data: openCamps } = openIds.length ? await admin.from("campaigns").select("id, country, destination_id").in("id", openIds) : { data: [] };

  // 1. Put back what is no longer covered.
  const restore = async (ch: Row, why: string) => {
    const finish = (note: string) => admin.from("ad_schedule_changes").update({ restored_at: new Date().toISOString(), restore_note: note, last_error: null }).eq("id", ch.id);
    if (ch.dry_run) { await finish(`Shown only. ${why}`); return; }
    try {
      const before = (ch.before ?? {}) as Row;
      const after = (ch.after ?? {}) as Row;
      // Did a person also turn it off or change it through this system while the rule was in force? Then it is theirs now.
      const { data: later } = await admin.from("ads_actions").select("by_email, kind").eq("meta_id", String(ch.meta_id)).eq("ok", true).neq("by_email", ME).gt("created_at", String(ch.applied_at)).in("kind", ch.kind === "pause" ? ["pause"] : ["budget"]).limit(1);
      if (later?.length) { await finish(`Left as it is: ${later[0].by_email} changed it too.`); done.left++; return; }
      const live = await meta(`${ch.meta_id}?fields=status,daily_budget`);
      if (ch.kind === "pause") {
        if (live.status !== "PAUSED") { await finish(`Left as it is: already ${String(live.status).toLowerCase()} in Meta.`); done.left++; return; }
        await meta(String(ch.meta_id), { status: "ACTIVE" });
        if (ch.level === "campaign" && ch.entity_id) await admin.from("campaigns").update({ delivery_status: "ACTIVE" }).eq("id", ch.entity_id);
        await log("activate", String(ch.level), ch.entity_id, ch.meta_id, String(ch.entity_name), { status: "PAUSED" }, { status: "ACTIVE", rule: ch.rule_name }, true);
        await finish(`Turned back on. ${why}`);
      } else {
        const nowBudget = live.daily_budget == null ? null : Number(live.daily_budget) / 100;
        if (nowBudget === null || Math.abs(nowBudget - Number(after.daily_budget)) > 0.01) { await finish(`Left as it is: the budget is now RM${nowBudget ?? "?"}, not what I set.`); done.left++; return; }
        await meta(String(ch.meta_id), { daily_budget: String(Math.round(Number(before.daily_budget) * 100)) });
        if (ch.entity_id) await admin.from(ch.level === "campaign" ? "campaigns" : "ad_sets").update({ daily_budget: Number(before.daily_budget) }).eq("id", ch.entity_id);
        await log("budget", String(ch.level), ch.entity_id, ch.meta_id, String(ch.entity_name), { daily_budget: after.daily_budget }, { daily_budget: before.daily_budget, rule: ch.rule_name }, true);
        await finish(`Budget put back to RM${before.daily_budget}. ${why}`);
      }
      done.restored++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (stop) return; // not this change's fault; try again next run without counting it against it
      const attempts = Number(ch.attempts ?? 0) + 1;
      await admin.from("ad_schedule_changes").update({ attempts, last_error: msg.slice(0, 500) }).eq("id", ch.id);
      done.failed++;
      if (attempts === 3 || attempts === 12) {
        await admin.from("notifications").insert({ kind: "alert", message: `Alila could not put back “${ch.entity_name}” after ${attempts} tries: ${msg.slice(0, 200)}. Check it in Ads Manager.`, link: "/settings/ad-schedule" });
        await log(ch.kind === "pause" ? "activate" : "budget", String(ch.level), ch.entity_id, ch.meta_id, String(ch.entity_name), {}, {}, false, `Could not put back: ${msg}`);
      }
    }
  };
  for (const ch of open) {
    const wanted = want.get(String(ch.campaign_id));
    const rule = ((ruleRows ?? []) as Rule[]).find((r) => r.id === ch.rule_id);
    const camp = (openCamps ?? []).find((c) => c.id === ch.campaign_id);
    const sameMode = Boolean(ch.dry_run) === dry;
    // It stays only while its own rule is in force, still says the same thing, still covers the campaign, and no stronger rule has taken over.
    const covered = on && sameMode && rule !== undefined && stillActive.has(rule.id) && rule.action === ch.kind && camp !== undefined && inScope(rule, camp) && !(wanted && wanted.rule.id !== rule.id);
    if (covered) continue;
    const why = !on ? "The schedule was switched off." : !sameMode ? "The mode was changed." : !rule ? "The rule was removed or switched off." : rule.skip_until && new Date(rule.skip_until) > nowUtc ? "Cancelled by a person." : !stillActive.has(rule.id) ? "The rule's time ended." : "The rule was changed.";
    await restore(ch, why);
  }
  const { data: openAfter } = await admin.from("ad_schedule_changes").select("campaign_id").is("restored_at", null);
  const taken = new Set((openAfter ?? []).map((c) => String(c.campaign_id)));

  // 2. Apply what is due.
  for (const [campaignId, { rule, camp }] of want) {
    if (taken.has(campaignId) || stop) continue;
    const base = { rule_id: rule.id, rule_name: rule.name, campaign_id: campaignId, dry_run: dry };
    try {
      if (rule.action === "pause") {
        if (!dry) {
          const live = await meta(`${camp.meta_campaign_id}?fields=status`);
          if (live.status !== "ACTIVE") continue;
          await meta(String(camp.meta_campaign_id), { status: "PAUSED" });
          await admin.from("campaigns").update({ delivery_status: "PAUSED" }).eq("id", campaignId);
          await log("pause", "campaign", campaignId, camp.meta_campaign_id, String(camp.name), { status: "ACTIVE" }, { status: "PAUSED", rule: rule.name }, true);
        }
        await admin.from("ad_schedule_changes").insert({ ...base, level: "campaign", entity_id: campaignId, meta_id: camp.meta_campaign_id, entity_name: camp.name, kind: "pause", before: { status: "ACTIVE" }, after: { status: "PAUSED" } });
        done.applied++;
        continue;
      }
      // Lower the daily budget: on the campaign if it holds the budget, otherwise on each running ad set.
      const pct = rule.percent ?? 50;
      const cut = (b: number) => Math.max(MIN_BUDGET, Math.round((b * (100 - pct)) / 100));
      let targets: { level: string; entity_id: string | null; meta_id: string; name: string; budget: number }[] = [];
      if (dry) {
        if (camp.daily_budget != null) targets = [{ level: "campaign", entity_id: campaignId, meta_id: String(camp.meta_campaign_id), name: String(camp.name), budget: Number(camp.daily_budget) }];
        else {
          const { data: sets } = await admin.from("ad_sets").select("id, name, meta_adset_id, daily_budget, delivery_status").eq("campaign_id", campaignId).eq("delivery_status", "ACTIVE").not("daily_budget", "is", null);
          targets = (sets ?? []).map((s) => ({ level: "ad_set", entity_id: s.id, meta_id: String(s.meta_adset_id), name: `${camp.name} > ${s.name}`, budget: Number(s.daily_budget) }));
        }
      } else {
        const live = await meta(`${camp.meta_campaign_id}?fields=status,daily_budget,adsets.limit(100){id,name,status,daily_budget}`);
        if (live.status !== "ACTIVE") continue;
        if (live.daily_budget != null) targets = [{ level: "campaign", entity_id: campaignId, meta_id: String(camp.meta_campaign_id), name: String(camp.name), budget: Number(live.daily_budget) / 100 }];
        else {
          const sets = ((((live.adsets ?? {}) as Row).data ?? []) as Row[]).filter((s) => s.status === "ACTIVE" && s.daily_budget != null);
          const { data: known } = await admin.from("ad_sets").select("id, meta_adset_id").in("meta_adset_id", sets.map((s) => String(s.id)));
          targets = sets.map((s) => ({ level: "ad_set", entity_id: (known ?? []).find((k) => k.meta_adset_id === String(s.id))?.id ?? null, meta_id: String(s.id), name: `${camp.name} > ${s.name}`, budget: Number(s.daily_budget) / 100 }));
        }
      }
      for (const t of targets) {
        const lower = cut(t.budget);
        if (lower >= t.budget) continue;
        if (!dry) {
          await meta(t.meta_id, { daily_budget: String(Math.round(lower * 100)) });
          if (t.entity_id) await admin.from(t.level === "campaign" ? "campaigns" : "ad_sets").update({ daily_budget: lower }).eq("id", t.entity_id);
          await log("budget", t.level, t.entity_id, t.meta_id, t.name, { daily_budget: t.budget }, { daily_budget: lower, rule: rule.name }, true);
        }
        await admin.from("ad_schedule_changes").insert({ ...base, level: t.level, entity_id: t.entity_id, meta_id: t.meta_id, entity_name: t.name, kind: "budget", before: { daily_budget: t.budget }, after: { daily_budget: lower } });
        done.applied++;
      }
    } catch (e) {
      if (stop) break;
      done.failed++;
      await log(rule.action === "pause" ? "pause" : "budget", "campaign", campaignId, camp.meta_campaign_id, String(camp.name), {}, {}, false, `Schedule rule “${rule.name}”: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const parts = [done.applied ? `${done.applied} changed` : "", done.restored ? `${done.restored} put back` : "", done.left ? `${done.left} left as someone else set them` : "", done.failed ? `${done.failed} failed` : "", stop].filter(Boolean);
  const note = `${dry ? "Show-only mode. " : ""}${parts.join(", ") || "Nothing to change."}`;
  await admin.from("ad_schedule_settings").update({ last_tick_at: nowUtc.toISOString(), last_tick_note: note }).eq("id", 1);
  if (done.applied || done.restored) await admin.from("activity_log").insert({ user_name: ME, action: `Ad schedule${dry ? " (show-only)" : ""}: ${parts.join(", ")}`, area: "Ad schedule" });
  return json({ ok: true, note, ...done, dry_run: dry, rules_in_force: active.map((r) => r.name) });
});
