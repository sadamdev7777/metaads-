// Connects the website form, WhatsApp, Meta Conversions API and Mailgun.
// Keys are typed into Settings, Integrations, checked with the provider, stored in Supabase Vault,
// and never sent back to the browser or written to any log.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const GRAPH = "https://graph.facebook.com";
const SECRETS: Record<string, string[]> = {
  website_form: ["leads_webhook_key"],
  whatsapp: ["whatsapp_token"],
  meta_capi: ["meta_capi_token"],
  mailgun: ["mailgun_api_key"],
};
const str = (v: unknown) => String(v ?? "").trim();
const usable = (v: unknown) => (typeof v === "string" && v.length >= 12 ? v : null);

async function graphGet(path: string, token: string) {
  const res = await fetch(`${GRAPH}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) return { ok: false as const, error: String(body?.error?.message ?? `Meta answered with status ${res.status}`) };
  return { ok: true as const, body };
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Send JSON." }, 400);
  }
  const key = str(body.integration);
  const action = str(body.action);
  if (!SECRETS[key]) return json({ ok: false, error: "Unknown integration." }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date().toISOString();
  const setStatus = (fields: Record<string, unknown>) =>
    admin.from("integration_status").update({ ...fields, last_checked_at: now }).eq("key", key);
  const getSecret = async (name: string) => usable((await admin.rpc("get_integration_secret", { p_name: name })).data);
  const setSecret = async (name: string, value: string) =>
    (await admin.rpc("set_integration_secret", { p_name: name, p_secret: value })).error?.message ?? null;
  const config = async () => {
    const { data } = await admin.from("integration_status").select("config").eq("key", key).maybeSingle();
    return (data?.config ?? {}) as Record<string, unknown>;
  };
  const fail = async (error: string, keepStatus = false) => {
    if (!keepStatus) await setStatus({ status: "check", detail: error });
    return json({ ok: false, error });
  };

  if (action === "disconnect") {
    for (const name of SECRETS[key]) await setSecret(name, "-");
    await setStatus({ status: "not_set_up", detail: "Disconnected. Nothing is stored.", secret_hint: null, updated_by_email: email, config: {} });
    return json({ ok: true });
  }

  /* ---------- Website form: a key for the leads webhook ---------- */
  if (key === "website_form") {
    const hookUrl = `${url}/functions/v1/leads-webhook`;
    if (action === "generate_key") {
      const bytes = crypto.getRandomValues(new Uint8Array(24));
      const newKey = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      const err = await setSecret("leads_webhook_key", newKey);
      if (err) return json({ ok: false, error: `Could not store the key: ${err}` });
      await setStatus({ status: "check", detail: "Key created. Waiting for the first lead from the website.", secret_hint: newKey.slice(-4), updated_by_email: email, config: { url: hookUrl } });
      return json({ ok: true, key: newKey, url: hookUrl });
    }
    if (action === "test") {
      if (!(await getSecret("leads_webhook_key"))) return json({ ok: false, error: "Create a key first." });
      const { count } = await admin.from("leads").select("id", { count: "exact", head: true });
      const { data: last } = await admin.from("leads").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const n = count ?? 0;
      const recent = last ? Date.now() - new Date(last.created_at).getTime() < 7 * 86400000 : false;
      await setStatus({
        status: recent ? "connected" : "check",
        detail: n === 0 ? "No lead has arrived yet. Send one from the website to finish the connection." : `${n} lead${n === 1 ? "" : "s"} received. Last one at ${last!.created_at}.`,
      });
      return json({ ok: true, count: n, last: last?.created_at ?? null });
    }
    return json({ ok: false, error: "Unknown action." }, 400);
  }

  /* ---------- WhatsApp Cloud API ---------- */
  if (key === "whatsapp") {
    const old = await config();
    const phoneId = action === "save" ? str(body.phone_number_id) : str(old.phone_number_id);
    const token = (action === "save" && usable(str(body.token))) || (await getSecret("whatsapp_token"));
    if (!token) return json({ ok: false, error: "Paste the WhatsApp access token." });
    if (!/^\d{5,}$/.test(phoneId)) return json({ ok: false, error: "Phone number ID should be the numeric ID from WhatsApp Manager, not the phone number." });
    const r = await graphGet(`${phoneId}?fields=display_phone_number,verified_name`, token);
    if (!r.ok) return await fail(`Meta rejected it: ${r.error}`, action === "save");
    const recipients = action === "save"
      ? str(body.recipients).split(/[\s,;]+/).map((x) => x.replace(/\D/g, "")).filter((x) => x.length >= 8)
      : ((old.recipients as string[]) ?? []);
    if (action === "save" && usable(str(body.token))) {
      const err = await setSecret("whatsapp_token", token);
      if (err) return json({ ok: false, error: `Could not store the token: ${err}` });
    }
    await setStatus({
      status: "connected",
      detail: `Connected to ${r.body.verified_name ?? "the WhatsApp number"} (${r.body.display_phone_number ?? phoneId}). ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}. Reports and approvals start in Phase 4.`,
      secret_hint: token.slice(-4),
      ...(action === "save" ? { updated_by_email: email } : {}),
      config: { phone_number_id: phoneId, display_phone_number: r.body.display_phone_number, verified_name: r.body.verified_name, recipients },
    });
    return json({ ok: true });
  }

  /* ---------- Meta Conversions API ---------- */
  if (key === "meta_capi") {
    const old = await config();
    const datasetId = action === "save" ? str(body.dataset_id) : str(old.dataset_id);
    const typed = action === "save" ? usable(str(body.token)) : null;
    const own = typed || (await getSecret("meta_capi_token"));
    const token = own || (await getSecret("meta_access_token"));
    if (!token) return json({ ok: false, error: "Paste a token, or connect Meta Ads first so its token can be used." });
    if (!/^\d{5,}$/.test(datasetId)) return json({ ok: false, error: "Dataset ID should be the numeric pixel or dataset ID from Events Manager." });
    const r = await graphGet(`${datasetId}?fields=name`, token);
    if (!r.ok) return await fail(`Meta rejected it: ${r.error}`, action === "save");
    if (typed) {
      const err = await setSecret("meta_capi_token", typed);
      if (err) return json({ ok: false, error: `Could not store the token: ${err}` });
    }
    await setStatus({
      status: "connected",
      detail: `Dataset "${r.body.name ?? datasetId}" is reachable using ${own ? "its own token" : "the Meta Ads token"}. Sending deposits back to Meta starts in Phase 4.`,
      secret_hint: token.slice(-4),
      ...(action === "save" ? { updated_by_email: email } : {}),
      config: { dataset_id: datasetId, name: r.body.name, token_source: own ? "own" : "meta_ads" },
    });
    return json({ ok: true });
  }

  /* ---------- Mailgun ---------- */
  if (key === "mailgun") {
    const old = await config();
    const domain = (action === "save" ? str(body.domain) : str(old.domain)).toLowerCase();
    const region = (action === "save" ? str(body.region) : str(old.region)).toUpperCase() === "EU" ? "EU" : "US";
    const apiKey = (action === "save" && usable(str(body.api_key))) || (await getSecret("mailgun_api_key"));
    if (!apiKey) return json({ ok: false, error: "Paste the Mailgun API key." });
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return json({ ok: false, error: "Enter the sending domain, for example mg.example.com." });
    const base = region === "EU" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
    // Test mode: Mailgun accepts the message and checks the key and domain, but does not deliver it.
    const form = new URLSearchParams({
      from: `MTB Marketing AI <postmaster@${domain}>`,
      to: `postmaster@${domain}`,
      subject: "Connection test",
      text: "Test mode. This message is not delivered.",
      "o:testmode": "yes",
    });
    const res = await fetch(`${base}/v3/${domain}/messages`, { method: "POST", headers: { Authorization: `Basic ${btoa(`api:${apiKey}`)}` }, body: form });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 200);
      const why = res.status === 401 ? "The key is wrong, or the domain is in the other region." : text || `Mailgun answered with status ${res.status}`;
      return await fail(`Mailgun rejected it: ${why}`, action === "save");
    }
    if (action === "save" && usable(str(body.api_key))) {
      const err = await setSecret("mailgun_api_key", apiKey);
      if (err) return json({ ok: false, error: `Could not store the key: ${err}` });
    }
    await setStatus({
      status: "connected",
      detail: `Key accepted for ${domain} (${region}). Checked with a test-mode message that is not delivered. Sending email starts in a later phase.`,
      secret_hint: apiKey.slice(-4),
      ...(action === "save" ? { updated_by_email: email } : {}),
      config: { domain, region },
    });
    return json({ ok: true });
  }

  return json({ ok: false, error: "Unknown integration." }, 400);
});
