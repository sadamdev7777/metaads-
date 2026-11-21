// Shows how one ad looks on Facebook or Instagram, as Meta renders it. Read only: nothing is changed.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const FORMATS = ["MOBILE_FEED_STANDARD", "INSTAGRAM_STANDARD", "INSTAGRAM_REELS", "INSTAGRAM_STORY", "FACEBOOK_REELS_MOBILE"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: who, error: whoErr } = await userClient.auth.getUser();
  if (whoErr || !who.user) return json({ ok: false, error: "Sign in first." }, 401);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const format = FORMATS.includes(String(body.format)) ? String(body.format) : FORMATS[0];

  const { data: tokenData } = await admin.rpc("get_integration_secret", { p_name: "meta_access_token" });
  const token = typeof tokenData === "string" && tokenData.length >= 20 ? tokenData : null;
  if (!token) return json({ ok: false, error: "Meta Ads is not connected." });
  const { data: ad } = await admin.from("ads").select("meta_ad_id").eq("id", String(body.ad_id ?? "")).maybeSingle();
  if (!ad?.meta_ad_id) return json({ ok: false, error: "That ad was not found. Sync with Meta and try again." });

  const res = await fetch(`https://graph.facebook.com/v27.0/${ad.meta_ad_id}/previews?ad_format=${format}`, { headers: { Authorization: `Bearer ${token}` } });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.error) return json({ ok: false, error: String(out?.error?.error_user_msg ?? out?.error?.message ?? `Meta answered with status ${res.status}`) });
  const html = String(out?.data?.[0]?.body ?? "");
  const src = (html.match(/src="([^"]+)"/)?.[1] ?? "").replace(/&amp;/g, "&");
  if (!/^https:\/\/([a-z0-9-]+\.)*facebook\.com\//.test(src)) return json({ ok: false, error: "Meta did not return a preview for this placement." });
  return json({ ok: true, src, format });
});
