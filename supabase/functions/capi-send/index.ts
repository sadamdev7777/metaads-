// Sends paid deposits from TravelCRM to Meta as "Purchase" events (Conversions API), so Meta learns
// who actually pays and can find more people like them. Runs once a night after the TravelCRM load.
// Only hashed phone and email ever reach this function or Meta (SHA-256, made before they are stored).
// Nothing is sent unless Settings, Integrations, Meta CAPI is switched on.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const GRAPH = "https://graph.facebook.com/v27.0";

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
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
  // The nightly job, or an active staff member pressing "Send now".
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey) {
    const expected = await secret("cron_key");
    if (!expected || cronKey !== expected) return json({ ok: false, error: "Not allowed." }, 401);
  } else {
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: who } = await userClient.auth.getUser();
    if (!who.user) return json({ ok: false, error: "Sign in first." }, 401);
    const { data: me } = await admin.from("profiles").select("active").eq("id", who.user.id).maybeSingle();
    if (!me?.active) return json({ ok: false, error: "Your access is turned off." }, 403);
  }
  const body = (await req.json().catch(() => ({}))) as { test_event_code?: string };

  const { data: st } = await admin.from("integration_status").select("config").eq("key", "meta_capi").maybeSingle();
  const cfg = (st?.config ?? {}) as { enabled?: boolean; pixel_id?: string };
  const testCode = typeof body.test_event_code === "string" && /^TEST\w+$/.test(body.test_event_code) ? body.test_event_code : null;
  if (!cfg.enabled && !testCode) return json({ ok: true, sent: 0, note: "Meta CAPI is switched off." });
  const pixel = String(cfg.pixel_id ?? "");
  const token = await secret("meta_access_token");
  if (!/^\d+$/.test(pixel) || !token) return json({ ok: false, error: "Pixel or Meta token missing." });

  // Meta accepts events up to 7 days old. Only bookings with at least one hashed contact can be matched.
  const since = new Date(Date.now() - 6.5 * 86400_000).toISOString().slice(0, 10);
  const { data: rows } = await admin.from("crm_bookings")
    .select("booking_id, pax, booking_date, paid_amount, phone_sha256, email_sha256")
    .eq("status", "paid_deposit").is("capi_sent_at", null).gte("booking_date", since)
    .or("phone_sha256.not.is.null,email_sha256.not.is.null").limit(testCode ? 1 : 500);
  if (!rows?.length) return json({ ok: true, sent: 0, note: "No new paid deposits with a hashed phone or email." });

  const my = await sha256("my");
  const now = Math.floor(Date.now() / 1000);
  let sent = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200);
    const data = part.map((r) => {
      // Booking date only has a day: use noon Malaysia time, never in the future.
      const t = Math.min(now - 60, Math.floor(Date.parse(`${r.booking_date}T04:00:00Z`) / 1000));
      const user_data: Record<string, string[]> = { country: [my] };
      if (r.phone_sha256) user_data.ph = [r.phone_sha256];
      if (r.email_sha256) user_data.em = [r.email_sha256];
      const custom_data: Record<string, unknown> = { currency: "MYR", num_items: r.pax ?? 1, content_type: "product" };
      if (r.paid_amount != null) custom_data.value = Number(r.paid_amount);
      return { event_name: "Purchase", event_time: t, event_id: `mtb-booking-${r.booking_id}`, action_source: "system_generated", user_data, custom_data };
    });
    const form = new URLSearchParams({ data: JSON.stringify(data) });
    if (testCode) form.set("test_event_code", testCode);
    const res = await fetch(`${GRAPH}/${pixel}/events`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    const out = await res.json().catch(() => ({}));
    const ids = part.map((r) => r.booking_id);
    if (!res.ok || out.error) {
      const msg = String(out?.error?.error_user_msg ?? out?.error?.message ?? `Meta answered ${res.status}`).slice(0, 400);
      errors.push(msg);
      if (!testCode) await admin.from("crm_bookings").update({ capi_error: msg }).in("booking_id", ids);
      continue;
    }
    sent += Number(out.events_received ?? part.length);
    if (!testCode) await admin.from("crm_bookings").update({ capi_sent_at: new Date().toISOString(), capi_error: null }).in("booking_id", ids);
  }
  const note = `${testCode ? "Test: " : ""}${sent} deposit${sent === 1 ? "" : "s"} sent to Meta${errors.length ? `, ${errors.length} batch failed: ${errors[0]}` : ""}.`;
  await admin.from("integration_status").update({ last_checked_at: new Date().toISOString(), detail: note, status: errors.length && !sent ? "check" : "connected" }).eq("key", "meta_capi");
  return json({ ok: errors.length === 0, sent, note });
});
