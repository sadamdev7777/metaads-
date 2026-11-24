// Lists pictures already in the MTB ad account, so Run campaign can build an ad from one without uploading it
// again: by default the pictures of ads running now, or with running:false every picture, newest first. Read only.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
type Row = Record<string, unknown>;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: who } = await userClient.auth.getUser();
  if (!who.user) return json({ ok: false, error: "Sign in first." }, 401);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: me } = await admin.from("profiles").select("active").eq("id", who.user.id).maybeSingle();
  if (!me?.active) return json({ ok: false, error: "Your access is turned off. Ask an admin." }, 403);

  const { data: tokenData } = await admin.rpc("get_integration_secret", { p_name: "meta_access_token" });
  const token = typeof tokenData === "string" && tokenData.length >= 20 ? tokenData : null;
  const { data: st } = await admin.from("integration_status").select("config").eq("key", "meta_ads").maybeSingle();
  const cfg = (st?.config ?? {}) as { selected?: string[] };
  const account = String(cfg.selected?.[0] ?? "").replace(/^act_/, "");
  if (!token || !account) return json({ ok: false, error: "Meta Ads is not connected." });

  const body = (await req.json().catch(() => ({}))) as Row;
  // Pictures of the ads running now (the default), each once.
  if (body.running !== false) {
    const filter = encodeURIComponent(JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }]));
    const r = await fetch(`https://graph.facebook.com/v27.0/act_${account}/ads?fields=name,creative{image_hash,image_url,thumbnail_url,object_story_spec}&filtering=${filter}&limit=200`, { headers: { Authorization: `Bearer ${token}` } });
    const o = (await r.json().catch(() => ({}))) as Row;
    if (!r.ok || o.error) return json({ ok: false, error: String(((o.error ?? {}) as Row).message ?? `Meta answered with status ${r.status}`) });
    const seen = new Set<string>();
    const images: Row[] = [];
    for (const ad of (o.data ?? []) as Row[]) {
      const c = (ad.creative ?? {}) as Row;
      const link = (((c.object_story_spec ?? {}) as Row).link_data ?? {}) as Row;
      const hash = String(c.image_hash ?? link.image_hash ?? "");
      if (!/^[0-9a-f]{32}$/.test(hash) || seen.has(hash)) continue;
      seen.add(hash);
      images.push({ hash, name: String(ad.name ?? ""), thumb: String(c.thumbnail_url ?? c.image_url ?? ""), url: String(c.image_url ?? c.thumbnail_url ?? ""), width: 0, height: 0, created: "" });
    }
    return json({ ok: true, images, next: "" });
  }
  const after = typeof body.after === "string" && /^[\w=-]+$/.test(body.after) ? `&after=${body.after}` : "";
  const res = await fetch(`https://graph.facebook.com/v27.0/act_${account}/adimages?fields=hash,name,permalink_url,url_128,width,height,created_time,status&limit=48${after}`, { headers: { Authorization: `Bearer ${token}` } });
  const out = (await res.json().catch(() => ({}))) as Row;
  if (!res.ok || out.error) return json({ ok: false, error: String(((out.error ?? {}) as Row).message ?? `Meta answered with status ${res.status}`) });
  const images = ((out.data ?? []) as Row[])
    .filter((i) => i.hash && i.status !== "DELETED" && Number(i.width) >= 400)
    .map((i) => ({ hash: String(i.hash), name: String(i.name ?? ""), thumb: String(i.url_128 ?? i.permalink_url ?? ""), url: String(i.permalink_url ?? i.url_128 ?? ""), width: Number(i.width), height: Number(i.height), created: String(i.created_time ?? "") }))
    .sort((a, b) => b.created.localeCompare(a.created));
  const next = String((((out.paging ?? {}) as Row).cursors as Row | undefined)?.after ?? "");
  return json({ ok: true, images, next: (out.paging as Row | undefined)?.next ? next : "" });
});
