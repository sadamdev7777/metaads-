// Creates ONE new ad in Meta from the system, always PAUSED, only when a signed-in person asks.
// It copies the page, Instagram account, link and button from an ad that already runs in the same campaign,
// and takes the picture or video from the Media library. Nothing here runs on a schedule.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const GRAPH = "https://graph.facebook.com/v27.0";
type Row = Record<string, unknown>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: who, error: whoErr } = await userClient.auth.getUser();
  if (whoErr || !who.user) return json({ ok: false, error: "Sign in first." }, 401);
  const email = who.user.email ?? "";
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = (await req.json().catch(() => ({}))) as Row;
  const { data: me } = await admin.from("profiles").select("active").eq("id", who.user.id).maybeSingle();
  if (!me?.active) return json({ ok: false, error: "Your access is turned off. Ask an admin." }, 403);

  const { data: tokenData } = await admin.rpc("get_integration_secret", { p_name: "meta_access_token" });
  const token = typeof tokenData === "string" && tokenData.length >= 20 ? tokenData : null;
  if (!token) return json({ ok: false, error: "Meta Ads is not connected." });
  const { data: st } = await admin.from("integration_status").select("config").eq("key", "meta_ads").maybeSingle();
  const cfg = (st?.config ?? {}) as { selected?: string[]; ad_account_id?: string };
  const account = String(cfg.selected?.[0] ?? cfg.ad_account_id ?? "").replace(/^act_/, "");
  if (!account) return json({ ok: false, error: "No ad account is chosen in Settings, Integrations." });
  const auth = { Authorization: `Bearer ${token}` };
  const fail = (out: Row, res: Response) => {
    const e = (out.error ?? {}) as Row;
    const msg = String(e.error_user_msg ?? e.message ?? `Meta answered with status ${res.status}`);
    return new Error(e.error_user_title ? `${e.error_user_title}: ${msg}` : msg);
  };
  const get = async (path: string) => {
    const res = await fetch(`${GRAPH}/${path}`, { headers: auth });
    const out = (await res.json().catch(() => ({}))) as Row;
    if (!res.ok || out.error) throw fail(out, res);
    return out;
  };
  const post = async (path: string, fields: Record<string, string>) => {
    const res = await fetch(`${GRAPH}/${path}`, { method: "POST", headers: auth, body: new URLSearchParams(fields) });
    const out = (await res.json().catch(() => ({}))) as Row;
    if (!res.ok || out.error) throw fail(out, res);
    return out;
  };
  // What a new ad borrows from an ad that already runs: page, Instagram account, link, button, tracking.
  const template = async (metaAdId: string) => {
    const out = await get(`${metaAdId}?fields=name,creative{object_story_spec,asset_feed_spec,url_tags,degrees_of_freedom_spec}`);
    const c = (out.creative ?? {}) as Row;
    const spec = (c.object_story_spec ?? null) as Row | null;
    if (!spec) throw new Error("That ad uses a format this system cannot copy yet (for example a flexible or catalogue ad). Choose another ad to copy the settings from.");
    const link = (spec.link_data ?? {}) as Row;
    const video = (spec.video_data ?? {}) as Row;
    const cta = ((link.call_to_action ?? video.call_to_action) ?? {}) as Row;
    const dest = String(link.link ?? (cta.value as Row | undefined)?.link ?? "");
    return {
      spec, url_tags: c.url_tags ? String(c.url_tags) : "", features: c.degrees_of_freedom_spec ?? null,
      kind: spec.video_data ? "video" : "image", message: String(link.message ?? video.message ?? ""), title: String(link.name ?? video.title ?? ""),
      link: dest, cta: String(cta.type ?? "LEARN_MORE"), caption: String(link.caption ?? (cta.value as Row | undefined)?.link_caption ?? dest),
    };
  };

  const { data: adSet } = await admin.from("ad_sets").select("id, name, meta_adset_id, campaign_id").eq("id", String(body.ad_set_id ?? "")).maybeSingle();
  if (!adSet?.meta_adset_id) return json({ ok: false, error: "That ad set was not found. Sync with Meta and try again." });
  const pickTemplate = async () => {
    const wanted = String(body.template_ad_id ?? "");
    if (wanted) {
      const { data } = await admin.from("ads").select("id, name, meta_ad_id").eq("id", wanted).maybeSingle();
      if (data?.meta_ad_id) return data;
    }
    // Otherwise an ad from the same ad set, else from the same campaign; running ones first.
    const { data: own } = await admin.from("ads").select("id, name, meta_ad_id, delivery_status").eq("ad_set_id", adSet.id).not("meta_ad_id", "is", null).limit(50);
    let pool = (own ?? []) as Row[];
    if (pool.length === 0) {
      const { data: sets } = await admin.from("ad_sets").select("id").eq("campaign_id", adSet.campaign_id);
      const { data: others } = await admin.from("ads").select("id, name, meta_ad_id, delivery_status").in("ad_set_id", (sets ?? []).map((s) => s.id)).not("meta_ad_id", "is", null).limit(50);
      pool = (others ?? []) as Row[];
    }
    pool.sort((a, b) => Number(b.delivery_status === "ACTIVE") - Number(a.delivery_status === "ACTIVE"));
    return (pool[0] as { id: string; name: string; meta_ad_id: string } | undefined) ?? null;
  };

  const CTAS = ["CONTACT_US", "LEARN_MORE", "BOOK_TRAVEL", "SIGN_UP", "GET_QUOTE", "GET_OFFER", "APPLY_NOW", "SHOP_NOW", "SUBSCRIBE", "DOWNLOAD"];
  try {
    // The Run campaign page names the page itself; elsewhere the page, link and button come from an ad that already runs.
    const ownPage = String(body.page_id ?? "").trim();
    const reuseId = String(body.creative_id ?? "").trim();
    const direct = body.action === "create" && (ownPage !== "" || reuseId !== "");
    const tplAd = direct ? null : await pickTemplate();
    if (!direct && !tplAd) return json({ ok: false, error: "This campaign has no ad yet to copy the page, link and button from. Create its first ad from Run campaign." });
    const tpl = tplAd ? await template(String(tplAd.meta_ad_id)) : null;

    /* ---------- Show what would be copied, so the form can be filled in ---------- */
    if (body.action === "template") {
      return json({ ok: true, template_ad_id: tplAd!.id, template_ad: tplAd!.name, kind: tpl!.kind, message: tpl!.message, title: tpl!.title, link: tpl!.link, cta: tpl!.cta });
    }
    if (body.action !== "create") return json({ ok: false, error: "Unknown action." }, 400);

    const name = String(body.name ?? "").trim().slice(0, 120);
    if (!name) return json({ ok: false, error: "Give the ad a name." });
    let creativeId = reuseId;
    let mediaRow: Row | null = null;
    let how = reuseId ? "same ad as before" : "";

    if (!creativeId) {
      const message = String(body.message ?? "").trim();
      const title = String(body.title ?? "").trim().slice(0, 250);
      const description = String(body.description ?? "").trim().slice(0, 250);
      const link = String(body.link ?? "").trim() || tpl?.link || "";
      const cta = CTAS.includes(String(body.cta ?? "")) ? String(body.cta) : tpl?.cta ?? "LEARN_MORE";
      const urlTags = typeof body.url_tags === "string" ? body.url_tags.trim().slice(0, 500) : tpl?.url_tags ?? "";
      const pageId = ownPage || String(tpl?.spec.page_id ?? "");
      const igId = ownPage ? String(body.instagram_user_id ?? "").trim() : String(tpl?.spec.instagram_user_id ?? "");
      if (!message) return json({ ok: false, error: "Write the ad text." });
      if (!/^https:\/\//.test(link)) return json({ ok: false, error: "The ad needs a link that starts with https://." });
      if (!pageId) return json({ ok: false, error: "The Facebook Page for this ad is not known." });

      // 1. The picture or video: one already in the ad account, or one from the Media library (uploaded once).
      let imageHash = String(body.image_hash ?? "").trim();
      let videoId = String(body.video_id ?? "").trim();
      let thumb = "";
      let isVideo = videoId !== "";
      if (!imageHash && !videoId) {
        const { data: media } = await admin.from("media").select("*").eq("id", String(body.media_id ?? "")).maybeSingle();
        if (!media?.file_path) return json({ ok: false, error: "Choose a picture or video from Media." });
        mediaRow = media;
        isVideo = String(media.mime_type ?? "").startsWith("video/") || media.format === "MP4";
        imageHash = String(media.meta_image_hash ?? "");
        videoId = String(media.meta_video_id ?? "");
        if (isVideo) {
          if (!videoId) {
            const signed = await admin.storage.from("media").createSignedUrl(media.file_path, 3600);
            if (signed.error || !signed.data?.signedUrl) throw new Error("Could not read the video from storage.");
            const up = await post(`act_${account}/advideos`, { file_url: signed.data.signedUrl, name: String(media.file_name ?? name).slice(0, 100) });
            videoId = String(up.id ?? "");
            if (!videoId) throw new Error("Meta did not accept the video.");
            await admin.from("media").update({ meta_video_id: videoId }).eq("id", media.id);
          }
          imageHash = "";
          // Meta needs a little time to process a video before it can be used in an ad.
          let ready = false;
          for (let i = 0; i < 22 && !ready; i++) {
            const v = await get(`${videoId}?fields=status,picture,thumbnails{uri,is_preferred}`);
            const state = String(((v.status ?? {}) as Row).video_status ?? "");
            if (state === "error") throw new Error("Meta could not process this video. Check the file (MP4, under 4 GB) and upload it again.");
            const thumbs = (((v.thumbnails ?? {}) as Row).data ?? []) as Row[];
            thumb = String((thumbs.find((t) => t.is_preferred) ?? thumbs[0] ?? {}).uri ?? v.picture ?? "");
            ready = state === "ready" && thumb !== "";
            if (!ready) await sleep(5000);
          }
          if (!ready) return json({ ok: false, pending: true, error: "Meta is still processing the video. Wait a minute and press Create again: the video will not be uploaded twice." });
        } else if (!imageHash) {
          const file = await admin.storage.from("media").download(media.file_path);
          if (file.error || !file.data) throw new Error("Could not read the picture from storage.");
          const bytes = new Uint8Array(await file.data.arrayBuffer());
          if (bytes.length > 8_000_000) return json({ ok: false, error: "The picture is larger than 8 MB. Upload a smaller copy." });
          const up = await post(`act_${account}/adimages`, { bytes: encodeBase64(bytes) });
          const first = Object.values((up.images ?? {}) as Record<string, Row>)[0];
          imageHash = String(first?.hash ?? "");
          if (!imageHash) throw new Error("Meta did not accept the picture.");
          await admin.from("media").update({ meta_image_hash: imageHash }).eq("id", media.id);
        }
        how = `media: ${media.file_name}`;
      } else how = "media already in the ad account";

      // 2. The creative: the page it runs under, the words, the link and the button.
      const story: Row = { page_id: pageId };
      if (igId) story.instagram_user_id = igId;
      if (isVideo) {
        const video: Row = { video_id: videoId, title, message, call_to_action: { type: cta, value: { link, link_caption: tpl?.caption || link } } };
        if (description) video.link_description = description;
        if (thumb) video.image_url = thumb; else if (imageHash) video.image_hash = imageHash;
        story.video_data = video;
      } else {
        const data: Row = { link, message, name: title, caption: tpl?.caption || link, image_hash: imageHash, call_to_action: { type: cta, value: { link } } };
        if (description) data.description = description;
        story.link_data = data;
      }
      const creativeFields: Record<string, string> = { name: `${name} ${new Date().toISOString().slice(0, 10)}`, object_story_spec: JSON.stringify(story) };
      if (urlTags) creativeFields.url_tags = urlTags;
      // Meta's own AI variations, as chosen in Run campaign. They are added on top of what was copied from the winning ad.
      const ai = (body.meta_ai ?? null) as { images?: boolean; text?: boolean } | null;
      let features = (tpl?.features ?? null) as Row | null;
      if (ai) {
        const spec = { ...(((features ?? {}) as Row).creative_features_spec as Row ?? {}) };
        const set = (keys: string[], on: boolean) => keys.forEach((k) => (spec[k] = { enroll_status: on ? "OPT_IN" : "OPT_OUT" }));
        set(["image_uncrop", "image_touchups", "image_brightness_and_contrast", "image_animation", "adapt_to_placement"], Boolean(ai.images));
        set(["text_optimizations", "enhance_cta"], Boolean(ai.text));
        features = { ...(features ?? {}), creative_features_spec: spec };
      }
      let creative: Row;
      try {
        creative = await post(`act_${account}/adcreatives`, features ? { ...creativeFields, degrees_of_freedom_spec: JSON.stringify(features) } : creativeFields);
      } catch (e) {
        if (!features) throw e;
        creative = await post(`act_${account}/adcreatives`, creativeFields); // the enhancement settings did not fit this format
      }
      creativeId = String(creative.id ?? "");
      if (!creativeId) throw new Error("Meta did not return the new creative.");
    }

    // 3. The ad itself, paused.
    const ad = await post(`act_${account}/ads`, { name, adset_id: String(adSet.meta_adset_id), creative: JSON.stringify({ creative_id: creativeId }), status: "PAUSED" });
    const metaAdId = String(ad.id ?? "");
    if (!metaAdId) throw new Error("Meta did not return the new ad.");

    const { data: row } = await admin.from("ads").insert({ meta_ad_id: metaAdId, ad_set_id: adSet.id, name, media_id: mediaRow?.id ?? null, delivery_status: "PAUSED", synced_at: new Date().toISOString(), is_sample: false }).select("id").single();
    const proposalId = typeof body.proposal_id === "string" && body.proposal_id ? body.proposal_id : null;
    await admin.from("ads_actions").insert({
      proposal_id: proposalId, kind: "create", level: "ad", entity_id: row?.id ?? null, meta_id: metaAdId, entity_name: `${adSet.name} > ${name}`,
      before: {}, after: { status: "PAUSED", creative_id: creativeId, copied_from: tplAd?.name ?? String(body.copied_from ?? "") ?? null, how }, ok: true, by_email: email,
    });
    if (proposalId) {
      await admin.from("proposals").update({ status: "applied", decided_by: who.user.id, decided_by_email: email, decided_at: new Date().toISOString(), applied_at: new Date().toISOString(), apply_note: `Created ad “${name}” in ${adSet.name}, paused.` }).eq("id", proposalId).in("status", ["pending", "approved"]);
    }
    await admin.from("activity_log").insert({ user_id: who.user.id, user_email: email, action: `Created ad “${name}” in ad set “${adSet.name}” in Meta, paused`, area: "Run campaign" });
    return json({ ok: true, ad_id: row?.id ?? null, meta_ad_id: metaAdId, note: `Created “${name}” in Meta, paused. Check it, then turn it on.` });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (body.action === "create") {
      await admin.from("ads_actions").insert({ kind: "create", level: "ad", entity_id: null, meta_id: String(adSet.meta_adset_id), entity_name: `${adSet.name} > ${String(body.name ?? "")}`, before: {}, after: {}, ok: false, error: message, by_email: email });
    }
    if (/page permission|create posts for Page/i.test(message)) return json({ ok: false, page_permission: true, error: "Meta refused: the connection is not allowed to make new ads for the Facebook Page. In Meta Business Settings, give the user or system user behind the token the “Create ads” permission on the Page, then press Create again. Using an existing ad as it is still works." });
    return json({ ok: false, error: /permission|not authorized|\(#10\)|\(#200\)/i.test(message) ? `The Meta token is not allowed to create ads: ${message}` : message });
  }
});
