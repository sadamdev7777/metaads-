// Anis, the creative analyst. Twice a week she reads the words and looks at the picture of the ads that
// spent the most, says which hooks work and why, and writes briefs for new creatives. She only proposes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const GRAPH = "https://graph.facebook.com/v27.0";
type Row = Record<string, unknown>;

const SYSTEM = `You are Anis, the creative analyst for Muslimtravelbug (MTB), a Malaysian travel agency that sells group tours to Malaysian Muslim travellers with Facebook and Instagram ads.

You are shown the ads that spent the most in the last 14 days. For each one you get its figures, its ad text and one picture (for a video this is only a still frame: you cannot watch the video, so do not judge pacing, sound or anything you cannot see).

Your job:
1. For each ad, say what the hook is (the first line or the first thing the eye lands on), what works and what holds it back. Tie it to the numbers: click rate (clicks / impressions) says whether the creative stops people; clicks-to-lead (leads / clicks) says whether the offer and the text convince them.
2. Find patterns across ads: which kinds of hook, picture, price mention, talent or layout go with cheap leads, and which with dear ones. Write them as short reusable lessons with evidence. Only write what the data supports.
3. Write at most 5 briefs for new creatives worth testing, most promising first. Each brief is for one destination already being advertised, names the format, gives the hook line and the primary text in Malay as MTB writes it, and says which winning ad it borrows from.

Rules:
- Never invent a price, date, discount, hotel or flight. Use only facts that appear in the ad texts you were given. If a brief needs a price, write [HARGA] for the team to fill in.
- Under about RM150 of spend or 5 leads is too little to judge: say "not enough data".
- Keep the copy halal-travel appropriate and honest: no false urgency, no promises about visas or weather.
- Plain English for the analysis, Malay for the ad copy.

Hand in your work by calling submit_review once: summary, then briefs, then ads, then patterns. Keep it short: no field over 45 words, except primary_text which may run to 90.`;

const TOOL = {
  name: "submit_review",
  description: "Hand in the creative review.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "3 to 5 sentences: what is winning creatively and what to make next" },
      briefs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            destination: { type: "string" }, campaign: { type: "string", description: "the campaign to add it to, exactly as named" }, campaign_id: { type: ["string", "null"] },
            format: { type: "string", enum: ["MP4", "PNG"] }, hook_line: { type: "string" }, concept: { type: "string", description: "what the picture or video shows" },
            primary_text: { type: "string", description: "the ad text in Malay" }, why: { type: "string", description: "why this should work, with the numbers of the ad it borrows from" },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
          },
          required: ["destination", "campaign", "format", "hook_line", "concept", "primary_text", "why", "confidence"],
        },
      },
      ads: {
        type: "array",
        items: {
          type: "object",
          properties: { ad: { type: "string", description: "Campaign > Ad set > Ad" }, verdict: { type: "string", enum: ["winner", "average", "weak", "not enough data"] }, hook: { type: "string" }, works: { type: "string" }, problem: { type: "string" } },
          required: ["ad", "verdict", "hook", "works", "problem"],
        },
      },
      patterns: {
        type: "array",
        items: { type: "object", properties: { lesson: { type: "string" }, evidence: { type: "string" }, confidence: { type: "string", enum: ["low", "medium", "high"] } }, required: ["lesson", "evidence", "confidence"] },
      },
    },
    required: ["summary", "briefs", "ads", "patterns"],
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
  const token = await secret("meta_access_token");
  if (!key) return json({ ok: false, error: "Connect the AI model in Settings, Integrations first." });
  if (!token) return json({ ok: false, error: "Connect Meta Ads in Settings, Integrations first." });
  const { data: st } = await admin.from("integration_status").select("config").eq("key", "ai_model").maybeSingle();
  const cfg = (st?.config ?? {}) as { model?: string; agents?: Record<string, string> };
  const model = cfg.agents?.planner || cfg.model;
  if (!model) return json({ ok: false, error: "No model chosen. Press Test connection in Settings, Integrations." });

  const { data: top } = await admin.rpc("ad_overview", { p_days: 14, p_limit: 14 });
  const ads = ((top ?? []) as Row[]).filter((a) => Number(a.spend) > 0);
  if (ads.length === 0) return json({ ok: false, error: "No ads with spend in the last 14 days." });
  const { data: metaRows } = await admin.from("ads").select("id, meta_ad_id").in("id", ads.map((a) => String(a.id)));
  const metaId = new Map(((metaRows ?? []) as Row[]).map((r) => [String(r.id), String(r.meta_ad_id ?? "")]));

  // Read each ad's words and one picture from Meta. A failure on one ad only leaves that ad without them.
  const content: Row[] = [{ type: "text", text: "Here are the ads, most spend first. Study them, then call submit_review. Do not answer in plain text." }];
  let seen = 0;
  let pictures = 0;
  for (const a of ads) {
    const id = metaId.get(String(a.id));
    let text = "", title = "", cta = "", kind = "", img = "";
    if (id) {
      try {
        const r = await fetch(`${GRAPH}/${id}?fields=creative{body,title,thumbnail_url,image_url,object_type,call_to_action_type,video_id,object_story_spec,asset_feed_spec}&thumbnail_width=640&thumbnail_height=640`, { headers: { Authorization: `Bearer ${token}` } });
        const c = ((await r.json().catch(() => ({}))) as Row).creative as Row | undefined;
        if (c) {
          const spec = (c.object_story_spec ?? {}) as Row;
          const link = (spec.link_data ?? {}) as Row;
          const video = (spec.video_data ?? {}) as Row;
          const feed = (c.asset_feed_spec ?? {}) as Row;
          const first = (v: unknown) => (Array.isArray(v) && v[0] ? String((v[0] as Row).text ?? "") : "");
          text = String(c.body ?? link.message ?? video.message ?? first(feed.bodies) ?? "");
          title = String(c.title ?? link.name ?? video.title ?? first(feed.titles) ?? "");
          cta = String(c.call_to_action_type ?? "");
          kind = c.video_id || spec.video_data ? "video (still frame only)" : "image";
          img = String(c.image_url ?? c.thumbnail_url ?? link.picture ?? video.image_url ?? "");
          seen++;
        }
      } catch { /* leave this ad without creative */ }
    }
    const imp = Number(a.impressions) || 0, clicks = Number(a.clicks) || 0, leads = Number(a.leads) || 0, spend = Number(a.spend) || 0;
    content.push({
      type: "text",
      text: `\n---\nAd: ${a.campaign} > ${a.ad_set} > ${a.ad}\nCampaign id: ${a.campaign_id ?? "unknown"}\nStatus: ${a.status}. Country: ${a.country ?? "not tagged"}. Type: ${kind || "unknown"}.\nSpend RM${spend.toFixed(2)}, leads ${leads}${leads ? ` (RM${(spend / leads).toFixed(2)} each)` : ""}, impressions ${imp}, clicks ${clicks}, click rate ${imp ? ((clicks / imp) * 100).toFixed(2) : "0"}%, clicks-to-lead ${clicks ? ((leads / clicks) * 100).toFixed(1) : "0"}%.\nHeadline: ${title || "(none read)"}\nButton: ${cta || "(none read)"}\nAd text:\n${text ? text.slice(0, 1500) : "(could not be read from Meta)"}`,
    });
    if (img && pictures < 12) {
      try {
        const p = await fetch(img);
        const type = (p.headers.get("content-type") ?? "").split(";")[0];
        const bytes = new Uint8Array(await p.arrayBuffer());
        if (p.ok && ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type) && bytes.length < 3_000_000) {
          content.push({ type: "image", source: { type: "base64", media_type: type, data: encodeBase64(bytes) } });
          pictures++;
        }
      } catch { /* no picture for this ad */ }
    }
  }
  if (seen === 0) return json({ ok: false, error: "Meta did not return the ad creatives. The Meta token may not be allowed to read them." });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 32000, system: SYSTEM, tools: [TOOL], tool_choice: { type: "auto" }, messages: [{ role: "user", content }] }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return json({ ok: false, error: String(out?.error?.message ?? `Anthropic answered with status ${res.status}`) });
  const parsed = ((out.content ?? []) as Row[]).find((b) => b.type === "tool_use" && b.name === "submit_review")?.input as Row | undefined;
  if (!parsed || typeof parsed.summary !== "string" || out.stop_reason === "max_tokens") return json({ ok: false, error: `The review did not come back complete (${out.stop_reason ?? "no reply"}). Nothing was saved.` });

  const list = (v: unknown) => (Array.isArray(v) ? (v as Row[]) : []);
  const str = (v: unknown, max = 2000) => (v == null ? null : String(v).slice(0, max));
  const briefs = list(parsed.briefs).filter((b) => b.destination && b.hook_line).slice(0, 5);
  const findings = [
    ...briefs.map((b) => ({ kind: "brief", title: `Brief: ${b.destination}, ${b.format}. "${String(b.hook_line).slice(0, 160)}"`, detail: `${str(b.concept, 500)}\n\nAd text: ${str(b.primary_text, 900)}\n\nWhy: ${str(b.why, 500)}` })),
    ...list(parsed.ads).slice(0, 14).map((a) => ({ kind: "ad", title: `${String(a.verdict ?? "").replace(/^./, (c) => c.toUpperCase())}: ${a.ad}`, detail: `Hook: ${str(a.hook, 300)}\nWorks: ${str(a.works, 400)}\nHolds it back: ${str(a.problem, 400)}` })),
  ];
  const { data: report, error: repErr } = await admin.from("ai_reports").insert({
    agent: "creative", period_days: 14, summary: str(parsed.summary, 4000), findings, review: [],
    model, input_tokens: out.usage?.input_tokens ?? null, output_tokens: out.usage?.output_tokens ?? null, triggered_by: who,
  }).select("id").single();
  if (repErr || !report) return json({ ok: false, error: `Could not save the review: ${repErr?.message}` });

  const lessons = list(parsed.patterns).filter((l) => l.lesson).slice(0, 6).map((l) => ({ agent: "creative", lesson: str(l.lesson, 600), evidence: str(l.evidence, 800), confidence: str(l.confidence, 20), report_id: report.id }));
  if (lessons.length) await admin.from("ai_learnings").insert(lessons);

  await admin.from("proposals").update({ status: "expired" }).eq("status", "pending").eq("agent", "creative");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const rows = briefs.map((b) => ({
    action_type: "Test new creative", target: str(b.campaign, 300), reason: `New ${b.format} for ${b.destination}: "${String(b.hook_line).slice(0, 200)}"`, numbers: null,
    cause: str(b.why, 700), how: `${str(b.concept, 380)}`, expected: `Ad text: ${str(b.primary_text, 380)}`, confidence: str(b.confidence, 20), agent: "creative", status: "pending", report_id: report.id,
    entity_level: "campaign", entity_id: typeof b.campaign_id === "string" && uuid.test(b.campaign_id) ? b.campaign_id : null, is_sample: false,
  }));
  if (rows.length) await admin.from("proposals").insert(rows);
  await admin.from("notifications").insert({ kind: "creative_review", message: `Anis's creative review is ready: ${rows.length} brief${rows.length === 1 ? "" : "s"}, ${lessons.length} lesson${lessons.length === 1 ? "" : "s"}.`, link: "/ai-office" });
  return json({ ok: true, report_id: report.id, briefs: rows.length, lessons: lessons.length, ads_read: seen, pictures });
});
