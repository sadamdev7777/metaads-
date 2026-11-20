// Receives leads from the MTB website form.
// The website's server sends each lead here with the webhook key in the x-webhook-key header.
// Call it from the server, never from browser code, so the key stays private.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const str = (v: unknown) => String(v ?? "").trim();

function sameKey(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Digits only. Malaysian numbers written as 01x become 601x, so they match TravelCRM. */
function normalisePhone(raw: unknown) {
  let d = str(raw).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "6" + d;
  return d.length >= 9 && d.length <= 15 ? d : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const provided = req.headers.get("x-webhook-key") ?? new URL(req.url).searchParams.get("key") ?? "";
  const { data: expected } = await admin.rpc("get_integration_secret", { p_name: "leads_webhook_key" });
  if (typeof expected !== "string" || expected.length < 12 || !sameKey(provided, expected)) {
    return json({ ok: false, error: "Wrong or missing webhook key." }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Send JSON." }, 400);
  }

  const phone = normalisePhone(body.phone ?? body.phone_number ?? body.telefon ?? body.mobile);
  if (!phone) return json({ ok: false, error: "A valid phone number is required in the phone field." }, 400);

  const nested = (body.utm ?? {}) as Record<string, unknown>;
  const utm: Record<string, string> = {};
  for (const k of ["source", "medium", "campaign", "content", "term"]) {
    const v = str(body[`utm_${k}`] ?? nested[k]);
    if (v) utm[k] = v.slice(0, 200);
  }
  const productName = str(body.product ?? body.product_name ?? body.package).slice(0, 200) || null;

  let productId: string | null = null;
  if (productName) {
    const { data } = await admin.from("products").select("id").ilike("name", productName).limit(1).maybeSingle();
    productId = data?.id ?? null;
  }
  let campaignId: string | null = null;
  if (utm.campaign) {
    const { data } = await admin.from("campaigns").select("id").eq("utm", utm.campaign).limit(1).maybeSingle();
    campaignId = data?.id ?? null;
  }

  const submitted = new Date(str(body.submitted_at));
  const { data: row, error } = await admin
    .from("leads")
    .insert({
      phone_normalized: phone,
      product_id: productId,
      campaign_id: campaignId,
      product_name: productName,
      utm: utm.campaign ?? null,
      utm_params: utm,
      created_at: Number.isNaN(submitted.getTime()) ? new Date().toISOString() : submitted.toISOString(),
    })
    .select("id")
    .single();
  if (error) return json({ ok: false, error: "Could not save the lead." }, 500);

  await admin
    .from("integration_status")
    .update({ status: "connected", detail: "Receiving leads from the website.", last_checked_at: new Date().toISOString() })
    .eq("key", "website_form");

  return json({ ok: true, id: row.id, matched_product: productId !== null, matched_campaign: campaignId !== null, has_utm: Boolean(utm.campaign) });
});
