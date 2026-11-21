// Bakri, the budget planner. Each morning he reads cost per pax by destination, seats left and the month's
// budget, and proposes how to split tomorrow's money. He only proposes: people approve in Approvals.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
type Row = Record<string, unknown>;

const SYSTEM = `You are Bakri, the budget planner for Muslimtravelbug (MTB), a Malaysian travel agency that sells group tours with Facebook and Instagram ads.

The goal is more paid-deposit pax for less money: target RM50 of ad spend per pax, hard limit RM80, inside the monthly budget.

Each morning you decide how the daily ad money should be split between destinations, using:
- cost per pax by destination (spend divided by pax) over the last 14 and 7 days. Deposits are matched to a destination, not to a campaign or an ad.
- cost per lead, as a second signal when pax is too thin to judge.
- seats: do not push money at a destination whose coming departures are nearly full, and do favour one with many empty seats and a departure 3 to 10 weeks away. The departure list is partial (it holds departures that already have a booking), so treat missing seats as unknown, not as zero.
- the month: budget, spent so far and days left. Say if the pace is too fast or too slow.

Rules:
- Thin data: under about RM300 of spend or under 3 pax in 14 days cannot be judged on cost per pax. Fall back to cost per lead and say so.
- Move money in steps of at most 30% a day for any one campaign. Never propose spending above the monthly budget.
- Deposits with no destination ("Unknown") hide real pax. If they are large, say your plan is less certain.
- Every proposal must name a real campaign or ad set from the data, with its id when you have it, and say exactly what the new daily amount should be.
- "luqman_pending" lists what Luqman, the night analyst, already proposed and nobody has decided yet. Do not propose a change for a campaign or ad set he already covers: one campaign gets one proposal. Say in your summary where you agree or disagree with him, and use your proposals for campaigns he left out.
- "notebook" includes reasons staff gave when they rejected a proposal (lessons starting "Staff rejected"). Follow them: do not propose again what staff turned down for a reason that still holds.
- Give numbers for every claim. Never invent a figure. Plain English, no jargon.

Hand in your work by calling submit_plan once: summary first, then proposals (most valuable first, at most 6), then the allocation table. Keep it short: no field over 40 words, and at most 15 allocation rows (destinations with spend only).`;

const TOOL = {
  name: "submit_plan",
  description: "Hand in this morning's budget plan.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "3 to 5 sentences: pace against the monthly budget and where money should move today" },
      proposals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            action_type: { type: "string", enum: ["Raise budget", "Lower budget", "Move budget", "Turn off campaign", "Check"] },
            level: { type: "string", enum: ["campaign", "ad_set"] },
            target: { type: "string", description: "Campaign, or Campaign > Ad set, exactly as named in the data" },
            id: { type: ["string", "null"] },
            reason: { type: "string" },
            numbers: { type: "string" },
            cause: { type: "string", description: "your view of why this destination deserves more or less money, including seats and dates" },
            how: { type: "string", description: "the exact change, with the new daily amount in RM" },
            expected: { type: "string" },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
          },
          required: ["action_type", "level", "target", "reason", "numbers", "cause", "how", "expected", "confidence"],
        },
      },
      allocations: {
        type: "array",
        description: "one row per destination with spend",
        items: {
          type: "object",
          properties: { destination: { type: "string" }, now_per_day: { type: "number" }, proposed_per_day: { type: "number" }, why: { type: "string" } },
          required: ["destination", "now_per_day", "proposed_per_day", "why"],
        },
      },
    },
    required: ["summary", "proposals", "allocations"],
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const secret = async (name: string) => {
    const { data } = await admin.rpc("get_integration_secret", { p_name: name });
    return typeof data === "string" && data.length >= 20 ? data : null;
  };
  let who = "";
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey) {
    const expected = await secret("cron_key");
    if (!expected || cronKey !== expected) return json({ ok: false, error: "Not allowed." }, 401);
    who = "schedule";
  } else {
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data.user) return json({ ok: false, error: "Sign in first." }, 401);
    who = data.user.email ?? "user";
  }

  const key = await secret("anthropic_api_key");
  if (!key) return json({ ok: false, error: "Connect the AI model in Settings, Integrations first." });
  const { data: st } = await admin.from("integration_status").select("config").eq("key", "ai_model").maybeSingle();
  const cfg = (st?.config ?? {}) as { model?: string; agents?: Record<string, string> };
  const model = cfg.agents?.planner || cfg.model;
  if (!model) return json({ ok: false, error: "No model chosen. Press Test connection in Settings, Integrations." });

  const day = (back: number) => new Date(Date.now() + 8 * 3600000 - back * 86400000).toISOString().slice(0, 10);
  const [d14, d7, camps, deps, dests, totals, lessons, luqman] = await Promise.all([
    admin.rpc("destination_cost_range", { p_from: day(13), p_to: day(0) }),
    admin.rpc("destination_cost_range", { p_from: day(6), p_to: day(0) }),
    admin.rpc("campaign_overview_range", { p_from: day(6), p_to: day(0) }),
    admin.from("crm_departures").select("destination_id, departure_date, seats_available").not("package_name", "is", null).gte("departure_date", day(0)).order("departure_date").limit(1000),
    admin.from("destinations").select("id, name"),
    admin.rpc("dashboard_totals"),
    admin.from("ai_learnings").select("lesson, confidence").eq("is_active", true).order("id", { ascending: false }).limit(40),
    admin.from("proposals").select("action_type, target, how").eq("status", "pending").eq("agent", "analyst").eq("is_sample", false).limit(12),
  ]);
  const destName = new Map(((dests.data ?? []) as Row[]).map((d) => [String(d.id), String(d.name)]));
  const seats: Record<string, { departures: number; seats_left: number; nearly_full: number; seats_unknown: number; next_dates: string[] }> = {};
  for (const d of (deps.data ?? []) as Row[]) {
    const name = destName.get(String(d.destination_id)) ?? "No destination";
    const s = (seats[name] ??= { departures: 0, seats_left: 0, nearly_full: 0, seats_unknown: 0, next_dates: [] });
    s.departures++;
    if (d.seats_available == null) s.seats_unknown++;
    else {
      s.seats_left += Number(d.seats_available);
      if (Number(d.seats_available) <= 5) s.nearly_full++;
    }
    if (s.next_dates.length < 4) s.next_dates.push(String(d.departure_date));
  }
  const keep = (rows: unknown, keys: string[]) => (Array.isArray(rows) ? rows : []).map((r) => Object.fromEntries(keys.map((k) => [k, (r as Row)[k]])));
  const dKeys = ["destination", "country", "matched", "spend", "leads", "campaigns", "bookings", "pax"];
  const t = (totals.data ?? {}) as Row;
  const brief = {
    today_malaysia: day(0),
    note: "Money is in Malaysian ringgit. Pax is paid-deposit pax from TravelCRM.",
    month: { budget: t.monthly_budget, spent: (t.periods as Row | undefined)?.month && ((t.periods as Row).month as Row).spend, day_of_month: t.day_of_month, days_in_month: t.days_in_month, target_cost_per_pax: t.target, limit_cost_per_pax: t.limit },
    deposits_from: t.deposits_from,
    destinations_last_14_days: keep((d14.data as Row | null)?.rows, dKeys),
    destinations_last_7_days: keep((d7.data as Row | null)?.rows, dKeys),
    seats_by_destination: seats,
    campaigns_last_7_days: keep(((camps.data ?? []) as Row[]).filter((c) => Number(c.spend) > 0 || c.delivery_status === "ACTIVE"), ["id", "name", "destination", "delivery_status", "daily_budget", "spend", "leads"]),
    luqman_pending: luqman.data ?? [],
    notebook: lessons.data ?? [],
  };
  if (brief.campaigns_last_7_days.length === 0) return json({ ok: false, error: "There is no ad data yet. Run a Meta sync first." });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 32000, system: SYSTEM, tools: [TOOL], tool_choice: { type: "auto" },
      messages: [{ role: "user", content: `Here is this morning's data as JSON. Study it, then call submit_plan. Do not answer in plain text.\n\n${JSON.stringify(brief)}` }],
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return json({ ok: false, error: String(out?.error?.message ?? `Anthropic answered with status ${res.status}`) });
  const parsed = ((out.content ?? []) as Row[]).find((b) => b.type === "tool_use" && b.name === "submit_plan")?.input as Row | undefined;
  if (!parsed || typeof parsed.summary !== "string" || out.stop_reason === "max_tokens") return json({ ok: false, error: `The plan did not come back complete (${out.stop_reason ?? "no reply"}). Nothing was saved.` });

  const list = (v: unknown) => (Array.isArray(v) ? (v as Row[]) : []);
  const str = (v: unknown, max = 2000) => (v == null ? null : String(v).slice(0, max));
  const rm = (v: unknown) => `RM${Math.round(Number(v) || 0)}`;
  const findings = list(parsed.allocations).slice(0, 30).map((a) => ({ title: `${a.destination}: ${rm(a.now_per_day)} to ${rm(a.proposed_per_day)} a day`, detail: str(a.why, 600) }));
  const { data: report, error: repErr } = await admin.from("ai_reports").insert({
    agent: "budget", period_days: 14, summary: str(parsed.summary, 4000), findings, review: [],
    model, input_tokens: out.usage?.input_tokens ?? null, output_tokens: out.usage?.output_tokens ?? null, triggered_by: who,
  }).select("id").single();
  if (repErr || !report) return json({ ok: false, error: `Could not save the plan: ${repErr?.message}` });

  await admin.from("proposals").update({ status: "expired" }).eq("status", "pending").eq("agent", "budget");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const rows = list(parsed.proposals).filter((p) => p.target && p.action_type).slice(0, 6).map((p) => ({
    action_type: str(p.action_type, 60), target: str(p.target, 300), reason: str(p.reason, 800), numbers: str(p.numbers, 400), cause: str(p.cause, 700),
    how: str(p.how, 400), expected: str(p.expected, 400), confidence: str(p.confidence, 20), agent: "budget", status: "pending", report_id: report.id,
    entity_level: ["campaign", "ad_set"].includes(String(p.level)) ? String(p.level) : null, entity_id: typeof p.id === "string" && uuid.test(p.id) ? p.id : null, is_sample: false,
  }));
  if (rows.length) await admin.from("proposals").insert(rows);
  await admin.from("notifications").insert({ kind: "budget_plan", message: `Bakri's budget plan is ready: ${rows.length} proposal${rows.length === 1 ? "" : "s"}.`, link: "/approvals" });
  return json({ ok: true, report_id: report.id, proposals: rows.length });
});
