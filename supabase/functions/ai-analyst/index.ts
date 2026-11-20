// Luqman, the night analyst. Once a night it reads the ad figures, checks what happened to its earlier
// proposals, writes lessons into its notebook and proposes changes for people to approve.
// It never changes anything in Meta. The API key lives in Supabase Vault and is never sent to the browser.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const API = "https://api.anthropic.com/v1";
const SECRET = "anthropic_api_key";
type Row = Record<string, unknown>;

const SYSTEM = `You are Luqman, the night analyst for Muslimtravelbug (MTB), a Malaysian travel agency that sells group tour packages through Facebook and Instagram ads.

How MTB works:
- One campaign is one tour product (for example "Seoul Korea"). Campaign names usually end with the staff member who runs it.
- Ad set and ad names describe the creative: PNG is a still image, MP4 is a video, H1/H2 are hooks or versions, and a person's name in an ad set is the talent in the video.
- The real goal is cost per pax deposit: target RM50, hard limit RM80. Budget is about RM100,000 a month.
- Deposits come from TravelCRM by COUNTRY only ("deposits_by_country"). They are not matched to individual campaigns or ads. So: judge a country against RM50 and RM80 using spend divided by pax_direct, and inside a country judge campaigns, ad sets and ads by cost per lead. Never state a cost per pax for a single campaign, ad set or ad.
- The country figure is an estimate. pax_direct leaves out bookings that look like agent or staff entries (pax_shared), but still includes repeat customers and other channels, so the true cost from ads is higher than it reads. If "deposits_first_date" is later than the start of the period, pax is undercounted and cost reads too high: say so and do not judge on it. Spend under "Not tagged" belongs to campaigns nobody has given a country yet: it cannot be judged, and tagging them is worth proposing.

Your job each night:
1. Study the figures. Find what is working and what is wasting money, at campaign, ad set and ad level. Compare creatives inside the same campaign (PNG against MP4, one hook against another, one talent against another).
2. Review your earlier proposals against the figures now. Say honestly whether you were right, wrong, or it is too early to tell.
3. Write lessons: short, specific, reusable statements about what works for MTB's ads, each with its evidence. Only write a lesson the data supports. A lesson already in your notebook should not be repeated; if new data contradicts one, say so in the review.
4. Propose at most 8 actions for tomorrow, the most valuable first. Staff approve or reject each one; nothing is changed automatically.

Rules for judgement:
- Do not judge anything on thin data. Under about RM150 of spend or under about 5 leads is too little: say "not enough data" rather than guess.
- Prefer comparisons inside one campaign over comparisons across countries, because prices and demand differ by destination.
- Give numbers for every claim, taken from the data. Never invent a figure.
- Write plain English that a busy marketing executive can act on. No jargon, no filler.

Reply with one JSON object and nothing else, in this shape:
{
  "summary": "3 to 5 sentences: the state of the ads and the most important thing to do tomorrow",
  "findings": [{"title": "short headline", "detail": "what the data shows, with numbers"}],
  "review": [{"proposal": "the earlier proposal", "verdict": "right | wrong | too early", "detail": "what happened, with numbers"}],
  "lessons": [{"lesson": "one reusable statement", "evidence": "the numbers behind it", "confidence": "low | medium | high"}],
  "proposals": [{"action_type": "Turn off ad | Turn off ad set | Raise budget | Lower budget | Move budget | Test new creative | Check", "level": "campaign | ad_set | ad", "target": "Campaign > Ad set > Ad, exactly as named in the data", "id": "the id from the data, or null", "reason": "why, in one or two sentences", "numbers": "the key figures", "expected": "what should happen if this is done", "confidence": "low | medium | high"}]
}`;

function extractJson(text: string): Row | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
const slim = (rows: unknown, keep: string[]) => (Array.isArray(rows) ? rows : []).map((r) => Object.fromEntries(keep.map((k) => [k, (r as Row)[k]])));

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
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data.user) return json({ ok: false, error: "Sign in first." }, 401);
    who = data.user.email ?? "user";
  }

  const body = (await req.json().catch(() => ({}))) as Row;
  const action = String(body.action ?? "run");
  const now = new Date().toISOString();
  const setStatus = (fields: Row) => admin.from("integration_status").update({ ...fields, last_checked_at: now }).eq("key", "ai_model");
  const config = async () => {
    const { data } = await admin.from("integration_status").select("config").eq("key", "ai_model").maybeSingle();
    return (data?.config ?? {}) as { model?: string; models?: string[] };
  };
  const headers = (key: string) => ({ "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" });
  // Listing models checks the key without spending anything.
  const listModels = async (key: string) => {
    const res = await fetch(`${API}/models?limit=100`, { headers: headers(key) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false as const, error: String(out?.error?.message ?? `Anthropic answered with status ${res.status}`) };
    return { ok: true as const, models: ((out.data ?? []) as Row[]).map((m) => String(m.id)) };
  };
  const pickModel = (models: string[], wanted?: string) =>
    (wanted && models.includes(wanted) ? wanted : null) ?? models.find((m) => m.includes("sonnet")) ?? models.find((m) => m.includes("opus")) ?? models[0] ?? "";

  if (action === "disconnect") {
    await admin.rpc("set_integration_secret", { p_name: SECRET, p_secret: "-" });
    await setStatus({ status: "not_set_up", detail: "Disconnected. No key is stored.", secret_hint: null, updated_by_email: who, config: {} });
    return json({ ok: true });
  }

  if (action === "save_key" || action === "test" || action === "set_model") {
    const raw = String(body.api_key ?? "").trim();
    const typed = raw.match(/sk-ant-[A-Za-z0-9_\-]{20,}/)?.[0] ?? (raw.length >= 20 ? raw : null);
    const key = (action === "save_key" && typed) || (await secret(SECRET));
    if (!key) return json({ ok: false, error: "Paste the Anthropic API key." });
    const listed = await listModels(key);
    if (!listed.ok) {
      if (action !== "save_key") await setStatus({ status: "check", detail: `Anthropic rejected the key: ${listed.error}` });
      return json({ ok: false, error: `Anthropic rejected the key: ${listed.error}` });
    }
    if (action === "save_key") {
      const { error } = await admin.rpc("set_integration_secret", { p_name: SECRET, p_secret: key });
      if (error) return json({ ok: false, error: `Could not store the key: ${error.message}` });
    }
    const old = await config();
    const model = pickModel(listed.models, action === "set_model" ? String(body.model ?? "") : old.model);
    await setStatus({
      status: "connected",
      detail: `Key accepted. Model: ${model}. Luqman studies the ads every night at 02:10 Malaysia time.`,
      secret_hint: key.slice(-4),
      ...(action === "save_key" ? { updated_by_email: who } : {}),
      config: { model, models: listed.models },
    });
    return json({ ok: true, model, models: listed.models });
  }

  if (action !== "run") return json({ ok: false, error: "Unknown action." }, 400);

  /* ---------- The nightly study ---------- */
  const key = await secret(SECRET);
  if (!key) return json({ ok: false, error: "Connect the AI model in Settings, Integrations first." });
  const cfg = await config();
  const model = cfg.model || pickModel(cfg.models ?? []);
  if (!model) return json({ ok: false, error: "No model chosen. Press Test connection in Settings, Integrations." });

  const [c30, c7, a30, a7, lessons, past, rules, dep] = await Promise.all([
    admin.rpc("campaign_overview", { p_days: 30 }),
    admin.rpc("campaign_overview", { p_days: 7 }),
    admin.rpc("ad_overview", { p_days: 30, p_limit: 150 }),
    admin.rpc("ad_overview", { p_days: 7, p_limit: 120 }),
    admin.from("ai_learnings").select("lesson, evidence, confidence, created_at").eq("is_active", true).order("id", { ascending: false }).limit(60),
    admin.from("proposals").select("created_at, action_type, target, reason, numbers, expected, status").eq("is_sample", false).order("created_at", { ascending: false }).limit(30),
    admin.from("rules").select("*").limit(1).maybeSingle(),
    admin.rpc("country_cost", { p_days: 30 }),
  ]);
  const withSpend = (rows: unknown) => (Array.isArray(rows) ? rows : []).filter((r) => Number((r as Row).spend) > 0 || (r as Row).delivery_status === "ACTIVE");
  const cKeep = ["id", "name", "country", "run_by", "delivery_status", "daily_budget", "spend", "leads", "impressions", "clicks"];
  const aKeep = ["id", "campaign", "ad_set", "ad", "status", "spend", "leads", "impressions", "clicks", "days_with_spend"];
  const brief = {
    today_malaysia: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
    note: "Money is in Malaysian ringgit. Leads are the leads Meta counts. Deposits are by country for the last 30 days.",
    deposits_first_date: (dep.data as Row | null)?.first_booking_date ?? null,
    deposits_by_country: (dep.data as Row | null)?.rows ?? [],
    rules: rules.data ?? null,
    campaigns_last_30_days: slim(withSpend(c30.data), cKeep),
    campaigns_last_7_days: slim(withSpend(c7.data), cKeep),
    ads_last_30_days: slim(a30.data, aKeep),
    ads_last_7_days: slim(a7.data, aKeep),
    your_notebook: lessons.data ?? [],
    your_earlier_proposals: past.data ?? [],
  };
  if (brief.campaigns_last_30_days.length === 0) return json({ ok: false, error: "There is no ad data to study yet. Run a Meta sync first." });

  const res = await fetch(`${API}/messages`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      model,
      max_tokens: 6000,
      system: SYSTEM,
      messages: [{ role: "user", content: `Here is tonight's data as JSON. Study it and reply with the JSON object described.\n\n${JSON.stringify(brief)}` }],
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = String(out?.error?.message ?? `Anthropic answered with status ${res.status}`);
    await setStatus({ status: "check", detail: `Last night's study failed: ${message}` });
    return json({ ok: false, error: message });
  }
  const text = ((out.content ?? []) as Row[]).filter((b) => b.type === "text").map((b) => String(b.text)).join("");
  const parsed = extractJson(text);
  if (!parsed || typeof parsed.summary !== "string") {
    await setStatus({ status: "check", detail: "Last night's study came back in a form the system could not read." });
    return json({ ok: false, error: "The model's answer could not be read. Nothing was saved." });
  }

  const list = (v: unknown) => (Array.isArray(v) ? (v as Row[]) : []);
  const str = (v: unknown, max = 2000) => (v == null ? null : String(v).slice(0, max));
  const { data: report, error: repErr } = await admin.from("ai_reports").insert({
    summary: str(parsed.summary, 4000), findings: list(parsed.findings).slice(0, 20), review: list(parsed.review).slice(0, 30),
    model, input_tokens: out.usage?.input_tokens ?? null, output_tokens: out.usage?.output_tokens ?? null, triggered_by: who,
  }).select("id").single();
  if (repErr || !report) return json({ ok: false, error: `Could not save the report: ${repErr?.message}` });

  const newLessons = list(parsed.lessons).filter((l) => l.lesson).slice(0, 12).map((l) => ({
    lesson: str(l.lesson, 600), evidence: str(l.evidence, 800), confidence: str(l.confidence, 20), report_id: report.id,
  }));
  if (newLessons.length) await admin.from("ai_learnings").insert(newLessons);

  // Yesterday's proposals nobody decided are closed, so the list stays short and current.
  await admin.from("proposals").update({ status: "expired" }).eq("status", "pending").eq("agent", "analyst");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const newProposals = list(parsed.proposals).filter((p) => p.target && p.action_type).slice(0, 8).map((p) => ({
    action_type: str(p.action_type, 60), target: str(p.target, 300), reason: str(p.reason, 800), numbers: str(p.numbers, 400),
    expected: str(p.expected, 400), confidence: str(p.confidence, 20), agent: "analyst", status: "pending", report_id: report.id,
    entity_level: ["campaign", "ad_set", "ad"].includes(String(p.level)) ? String(p.level) : null,
    entity_id: typeof p.id === "string" && uuid.test(p.id) ? p.id : null, is_sample: false,
  }));
  if (newProposals.length) await admin.from("proposals").insert(newProposals);

  await admin.from("notifications").insert({
    kind: "night_report",
    message: `Luqman's night report is ready: ${newProposals.length} proposal${newProposals.length === 1 ? "" : "s"}, ${newLessons.length} new lesson${newLessons.length === 1 ? "" : "s"}.`,
    link: "/ai-office",
  });
  await setStatus({ status: "connected", detail: `Last study ${now.slice(0, 16).replace("T", " ")} UTC with ${model}: ${newProposals.length} proposals, ${newLessons.length} lessons.` });
  return json({ ok: true, report_id: report.id, proposals: newProposals.length, lessons: newLessons.length });
});
