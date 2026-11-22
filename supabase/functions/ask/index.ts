// The chat bubble. Staff ask a question; the AI staff member whose work it concerns answers from the figures
// already in this system. It only reads and answers: it never changes Meta, a rule or a proposal.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
type Row = Record<string, unknown>;
const AGENTS = ["luqman", "bakri", "anis", "alila", "mira", "dara"];
const PAGES = ["/dashboard", "/approvals", "/products", "/media", "/campaigns", "/campaigns/new", "/analysis", "/ai-office", "/history", "/settings/rules", "/settings/ad-schedule", "/settings/destinations", "/settings/budget", "/settings/integrations"];

const SYSTEM = `You are the AI staff of MTB Marketing AI, the system Muslimtravelbug (MTB), a Malaysian travel agency, uses to run its Facebook and Instagram ads. A member of MTB's staff is asking a question in the chat. Exactly one of you answers, the one whose work the question is about:

- luqman, Night Analyst: results. Which campaigns, ads and destinations do well or badly, cost per lead, cost per pax, why something is expensive, what his last study found.
- bakri, Budget Planner: money. Where the budget should go, whether to raise or lower a budget, pace against the month's budget, his morning plan.
- anis, Creative Analyst: the ads themselves. Hooks, text, pictures and videos, what to make next, her last review.
- alila, Schedule Keeper: the ad schedule. Rules that pause campaigns or lower budgets by hours and dates, results by weekday.
- mira, Campaign Planner: how to build and launch a campaign in this system, ad text.
- dara, Data Keeper: where a figure comes from, how the system works, where to find a page, sync and data questions, and anything that fits nobody else.

If the staff member chose who to ask, that one answers, even if another would know better; then say in one short sentence who knows more.

How to answer:
- Answer in the language of the question (Bahasa Melayu as Malaysians write it, or English). Keep MTB's own terms: lead, deposit, pax, campaign, ad set, budget.
- Lead with the answer. Short: a phone screen. Plain sentences, or a few lines starting with "- ". No markdown, no headings, no tables.
- Use only the figures you are given. Give the number and its period ("30 hari lepas"). Never estimate a figure you do not have. If the data does not hold the answer, say so plainly and say where it could be found.
- Cost per pax is known only for a destination or a country, never for one ad or one campaign: deposits are matched to destinations, not to ads. A "lead" is a website enquiry counted by Meta. Deposits count only bookings with a paid deposit.
- Say when the numbers are thin (few leads, few days).
- You cannot change anything. If asked to pause, turn on, change a budget, create an ad or change a rule, do not pretend you did: say which page does it and give that page as a link.
- Do not give customer names or phone numbers; you have none.
- A question that has nothing to do with MTB's ads or this system: say briefly that you only help with the ads here.

links: at most 2 pages of this system that help with the answer, from the list you are given (a campaign's own page is /campaigns/<id> using an id from the data). follow_ups: 2 or 3 short questions the person might ask next, in their language. Submit with the reply tool.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const secret = async (name: string) => {
    const { data } = await admin.rpc("get_integration_secret", { p_name: name });
    return typeof data === "string" && data.length >= 20 ? data : null;
  };
  // Signed-in staff, or the system's own check (the key kept in the vault).
  let email = "";
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey) {
    const expected = await secret("cron_key");
    if (!expected || cronKey !== expected) return json({ ok: false, error: "Not allowed." }, 401);
    email = "system check";
  } else {
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: who, error: whoErr } = await userClient.auth.getUser();
    if (whoErr || !who.user) return json({ ok: false, error: "Sign in first." }, 401);
    email = who.user.email ?? "";
  }
  const body = (await req.json().catch(() => ({}))) as Row;
  const question = String(body.question ?? "").trim().slice(0, 1500);
  if (!question) return json({ ok: false, error: "Type a question." });
  const asked = AGENTS.includes(String(body.agent)) ? String(body.agent) : "";

  // A person cannot run up the bill by accident: 40 questions an hour each.
  const { count } = await admin.from("chat_log").select("id", { count: "exact", head: true }).eq("user_email", email).gt("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= 40) return json({ ok: false, error: "That is a lot of questions in one hour. Try again a little later." });

  const key = await secret("anthropic_api_key");
  if (!key) return json({ ok: false, error: "Connect the AI model in Settings, Integrations first." });
  const { data: integ } = await admin.from("integration_status").select("config").eq("key", "ai_model").maybeSingle();
  const cfg = (integ?.config ?? {}) as { model?: string; agents?: Record<string, string> };
  const model = cfg.agents?.chat || cfg.agents?.planner || cfg.model;
  if (!model) return json({ ok: false, error: "No model chosen. Open Settings, Integrations." });

  // What the staff know: the same figures the pages show.
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const [dash, dest, camps, ads, reports, proposals, rules, lessons, sset, srules, sstats, deps, actions, sync] = await Promise.all([
    admin.rpc("dashboard_totals"),
    admin.rpc("destination_cost", { p_days: 30 }),
    admin.rpc("campaign_overview", { p_days: 30 }),
    admin.rpc("ad_overview", { p_days: 30, p_limit: 30 }),
    admin.from("ai_reports").select("agent, created_at, summary").order("id", { ascending: false }).limit(12),
    admin.from("proposals").select("agent, action_type, target, reason, numbers, how, confidence, created_at").eq("status", "pending").eq("is_sample", false).order("created_at", { ascending: false }).limit(20),
    admin.from("rules").select("target_cost_per_pax, limit_cost_per_pax, monthly_budget, daily_spend_limit, max_budget_increase_pct").limit(1).maybeSingle(),
    admin.from("ai_learnings").select("agent, lesson").eq("is_active", true).order("id", { ascending: false }).limit(30),
    admin.from("ad_schedule_settings").select("enabled, dry_run, last_tick_note, last_review").eq("id", 1).maybeSingle(),
    admin.from("ad_schedule_rules").select("name, enabled, kind, days, time_from, time_to, starts_at, ends_at, action, percent, scope"),
    admin.rpc("ad_schedule_stats"),
    admin.from("crm_departures").select("destination_id, departure_date, seats_available").gte("departure_date", today).limit(2000),
    admin.from("ads_actions").select("created_at, kind, level, entity_name, ok, by_email").order("id", { ascending: false }).limit(15),
    admin.from("sync_runs").select("started_at, ok, source").order("started_at", { ascending: false }).limit(1),
  ]);
  const { data: destNames } = await admin.from("destinations").select("id, name");
  const nameOf = new Map((destNames ?? []).map((d) => [d.id, d.name]));
  const seats = new Map<string, { departures: number; seats: number; next: string }>();
  for (const d of (deps.data ?? []) as Row[]) {
    const k = String(nameOf.get(String(d.destination_id)) ?? "No destination set");
    const s = seats.get(k) ?? { departures: 0, seats: 0, next: String(d.departure_date) };
    s.departures++;
    s.seats += Number(d.seats_available ?? 0);
    if (String(d.departure_date) < s.next) s.next = String(d.departure_date);
    seats.set(k, s);
  }
  const latest = new Map<string, Row>();
  for (const r of (reports.data ?? []) as Row[]) if (!latest.has(String(r.agent))) latest.set(String(r.agent), r);
  const round = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100;
  const campList = ((camps.data ?? []) as Row[]).sort((a, b) => Number(b.spend) - Number(a.spend));
  const data = {
    today_malaysia: today,
    targets: rules.data ?? null,
    totals: dash.data ?? null,
    destinations_last_30_days: (((dest.data ?? {}) as Row).rows ?? []) as Row[],
    deposits_counted_from: ((dest.data ?? {}) as Row).first_booking_date ?? null,
    campaigns_last_30_days: campList.filter((c) => Number(c.spend) > 0 || c.delivery_status === "ACTIVE").slice(0, 45).map((c) => ({ id: c.id, name: c.name, status: c.delivery_status, destination: c.destination, run_by: c.run_by, daily_budget: c.daily_budget, spend: round(c.spend), leads: c.leads, cost_per_lead: Number(c.leads) ? round(Number(c.spend) / Number(c.leads)) : null, clicks: c.clicks, impressions: c.impressions })),
    campaigns_running_now: campList.filter((c) => c.delivery_status === "ACTIVE").length,
    top_ads_last_30_days: ((ads.data ?? []) as Row[]).map((a) => ({ ad: a.ad, ad_set: a.ad_set, campaign: a.campaign, status: a.status, spend: round(a.spend), leads: a.leads, cost_per_lead: Number(a.leads) ? round(Number(a.spend) / Number(a.leads)) : null, clicks: a.clicks, impressions: a.impressions })),
    seats_left_by_destination: Object.fromEntries(seats),
    last_reports: { luqman: latest.get("analyst") ?? null, bakri: latest.get("budget") ?? null, anis: latest.get("creative") ?? null },
    proposals_waiting_in_approvals: proposals.data ?? [],
    notebook: lessons.data ?? [],
    ad_schedule: { alila: sset.data ?? null, rules: srules.data ?? [], by_weekday_last_8_weeks: ((sstats.data ?? {}) as Row).by_weekday ?? [] },
    recent_changes_in_meta: actions.data ?? [],
    last_sync_with_meta: sync.data?.[0] ?? null,
    pages: PAGES,
  };

  const history = (Array.isArray(body.history) ? (body.history as Row[]) : []).slice(-8).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.text ?? "").slice(0, 1500) })).filter((m) => m.content);
  while (history.length && history[0].role !== "user") history.shift();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 1500, tool_choice: { type: "auto" },
      system: [{ type: "text", text: SYSTEM }, { type: "text", text: `The figures in the system right now:\n${JSON.stringify(data)}` }],
      tools: [{
        name: "reply", description: "Give the answer to the staff member.",
        input_schema: { type: "object", required: ["agent", "answer"], properties: {
          agent: { type: "string", enum: AGENTS }, answer: { type: "string" },
          links: { type: "array", maxItems: 2, items: { type: "object", required: ["label", "path"], properties: { label: { type: "string" }, path: { type: "string" } } } },
          follow_ups: { type: "array", maxItems: 3, items: { type: "string" } } } },
      }],
      messages: [...history, { role: "user", content: `${asked ? `(Asked of: ${asked})\n` : ""}${question}\n\nAnswer with the reply tool.` }],
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return json({ ok: false, error: String(out?.error?.message ?? `The AI model answered with status ${res.status}`) });
  const blocks = (out.content ?? []) as Row[];
  const input = (blocks.find((b) => b.type === "tool_use")?.input ?? {}) as { agent?: string; answer?: string; links?: Row[]; follow_ups?: string[] };
  const answer = String(input.answer ?? blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n")).trim();
  if (!answer) return json({ ok: false, error: "No answer came back. Ask again." });
  const agent = asked || (AGENTS.includes(String(input.agent)) ? String(input.agent) : "dara");
  const links = (input.links ?? []).map((l) => ({ label: String(l.label ?? "").slice(0, 60), path: String(l.path ?? "") })).filter((l) => l.label && (PAGES.includes(l.path) || /^\/campaigns\/[0-9a-f-]{36}$/.test(l.path))).slice(0, 2);
  const follow = (input.follow_ups ?? []).map((f) => String(f).slice(0, 120)).filter(Boolean).slice(0, 3);
  await admin.from("chat_log").insert({ user_email: email, asked_of: asked || null, answered_by: agent, question, answer: answer.slice(0, 6000), model, input_tokens: out.usage?.input_tokens ?? null, output_tokens: out.usage?.output_tokens ?? null });
  return json({ ok: true, agent, answer, links, follow_ups: follow });
});
