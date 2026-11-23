// Everything the Run campaign page needs: the shape of the form, MTB's usual settings, and the calls to Meta.
import { supabase } from "./supabase";

export type Pick = { id: string; name: string; note?: string; kind?: string; country?: string; radius?: number };
export type Placements = { mode: "auto" | "core" | "manual"; platforms: string[]; facebook: string[]; instagram: string[]; devices: string[] };
export type Audience = {
  base: Record<string, unknown>; // parts of a copied audience this form has no field for; kept as they were
  countries: string[];
  regions: Pick[];
  cities: Pick[];
  age_min: number;
  age_max: number;
  gender: "all" | "male" | "female";
  locales: Pick[];
  interests: Pick[];
  include: Pick[];
  exclude: Pick[];
  advantage: boolean;
  placements: Placements;
};
export type AdDraft = {
  key: string;
  name: string;
  mode: "reuse" | "same" | "library"; // the ad as it is / same picture or video with new words / media from the library
  from?: { id: string; ad: string; campaign?: string; cpl?: string };
  kind?: string;
  creative_id?: string;
  image_hash?: string;
  video_id?: string;
  thumb?: string;
  media_id?: string;
  message: string;
  title: string;
  description: string;
  link: string;
  cta: string;
  url_tags: string;
};
export type Build = {
  dest: string;
  where: "new" | "existing";
  campaign_id: string;
  c: { name: string; objective: string; budget_level: "adset" | "campaign"; daily_budget: string; bid_strategy: string; spend_cap: string };
  s: {
    name: string; goal: string; pixel_id: string; event: string; budget_type: "daily" | "lifetime"; budget: string; start: string; end: string;
    bid_strategy: string; bid_amount: string; attribution: string; audience: Audience; from?: { id: string; name: string; campaign: string };
  };
  ads: AdDraft[];
  /** Meta's own AI variations of each ad. Images: expand, touch up, brightness, slight motion, fit each placement. Text: Meta may swap or reword. */
  ai?: { images: boolean; text: boolean };
};
export const DEFAULT_AI = { images: true, text: false };

export const OBJECTIVES = [
  { v: "OUTCOME_LEADS", t: "Leads", d: "People who enquire on the website. What MTB uses." },
  { v: "OUTCOME_SALES", t: "Sales", d: "People who buy or pay on the website." },
  { v: "OUTCOME_TRAFFIC", t: "Traffic", d: "As many visits to the page as possible." },
  { v: "OUTCOME_AWARENESS", t: "Awareness", d: "Show the ad to as many people as possible." },
];
export const GOALS: Record<string, { v: string; t: string }[]> = {
  OUTCOME_LEADS: [{ v: "OFFSITE_CONVERSIONS", t: "Most leads on the website" }, { v: "LANDING_PAGE_VIEWS", t: "Most landing page views" }, { v: "LINK_CLICKS", t: "Most link clicks" }],
  OUTCOME_SALES: [{ v: "OFFSITE_CONVERSIONS", t: "Most sales on the website" }, { v: "LANDING_PAGE_VIEWS", t: "Most landing page views" }, { v: "LINK_CLICKS", t: "Most link clicks" }],
  OUTCOME_TRAFFIC: [{ v: "LANDING_PAGE_VIEWS", t: "Most landing page views" }, { v: "LINK_CLICKS", t: "Most link clicks" }],
  OUTCOME_AWARENESS: [{ v: "REACH", t: "Reach the most people" }, { v: "IMPRESSIONS", t: "Most impressions" }],
};
export const EVENTS: Record<string, { v: string; t: string }[]> = {
  OUTCOME_LEADS: [{ v: "COMPLETE_REGISTRATION", t: "Complete registration (MTB's lead)" }, { v: "LEAD", t: "Lead" }, { v: "CONTACT", t: "Contact" }, { v: "SUBMIT_APPLICATION", t: "Submit application" }, { v: "SCHEDULE", t: "Schedule" }],
  OUTCOME_SALES: [{ v: "PURCHASE", t: "Purchase" }, { v: "INITIATED_CHECKOUT", t: "Initiate checkout" }, { v: "ADD_TO_CART", t: "Add to cart" }, { v: "COMPLETE_REGISTRATION", t: "Complete registration" }, { v: "LEAD", t: "Lead" }, { v: "CONTENT_VIEW", t: "View content" }],
};
export const BIDS = [
  { v: "LOWEST_COST_WITHOUT_CAP", t: "Highest volume", d: "Meta gets the most results for the budget. What MTB uses." },
  { v: "COST_CAP", t: "Cost per result goal", d: "Meta tries to keep the average cost per result near your amount." },
  { v: "LOWEST_COST_WITH_BID_CAP", t: "Bid cap", d: "Never bids above your amount. Can stop delivery if set too low." },
];
export const ATTRIBUTION = [
  { v: "7c1v", t: "7 days after a click, 1 day after a view (MTB's usual)" },
  { v: "7c", t: "7 days after a click" },
  { v: "1c", t: "1 day after a click" },
];
export const CTAS = [
  { v: "CONTACT_US", t: "Contact us" }, { v: "LEARN_MORE", t: "Learn more" }, { v: "BOOK_TRAVEL", t: "Book now" }, { v: "SIGN_UP", t: "Sign up" },
  { v: "GET_QUOTE", t: "Get quote" }, { v: "GET_OFFER", t: "Get offer" }, { v: "APPLY_NOW", t: "Apply now" }, { v: "SHOP_NOW", t: "Shop now" },
];
export const COUNTRY_CHOICES = [
  { v: "MY", t: "Malaysia" }, { v: "BN", t: "Brunei" }, { v: "ID", t: "Indonesia" }, { v: "TH", t: "Thailand" }, { v: "SG", t: "Singapore" },
];
export const PLATFORMS = [
  { v: "facebook", t: "Facebook" }, { v: "instagram", t: "Instagram" }, { v: "threads", t: "Threads" }, { v: "messenger", t: "Messenger" }, { v: "audience_network", t: "Audience Network" },
];
export const FB_POSITIONS = [
  { v: "feed", t: "Feed" }, { v: "story", t: "Stories" }, { v: "facebook_reels", t: "Reels" }, { v: "instream_video", t: "In-stream video" }, { v: "marketplace", t: "Marketplace" },
  { v: "video_feeds", t: "Video feeds" }, { v: "search", t: "Search results" }, { v: "profile_feed", t: "Profile feed" },
];
export const IG_POSITIONS = [
  { v: "stream", t: "Feed" }, { v: "story", t: "Stories" }, { v: "reels", t: "Reels" }, { v: "explore", t: "Explore" }, { v: "explore_home", t: "Explore home" }, { v: "profile_feed", t: "Profile feed" }, { v: "ig_search", t: "Search results" },
];
// The three languages MTB's ad sets use, by Meta's own numbers.
export const MTB_LOCALES: Pick[] = [{ id: "41", name: "Malay" }, { id: "6", name: "English (US)" }, { id: "24", name: "English (UK)" }];

export const dm = () => {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}`;
};
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const staffName = (email: string) => cap((email.split("@")[0] ?? "").replace(/[._-].*$/, ""));
export const uid = () => Math.random().toString(36).slice(2, 9);

export const standardAudience = (): Audience => ({
  base: {}, countries: ["MY"], regions: [], cities: [], age_min: 22, age_max: 65, gender: "all", locales: MTB_LOCALES, interests: [], include: [], exclude: [], advantage: true,
  placements: { mode: "auto", platforms: ["facebook", "instagram"], facebook: ["feed", "story", "facebook_reels"], instagram: ["stream", "story", "reels"], devices: ["mobile", "desktop"] },
});
export const blankAd = (n: number, link = "", cta = "CONTACT_US", url_tags = ""): AdDraft => ({ key: uid(), name: `Ad ${n}`, mode: "library", message: "", title: "", description: "", link, cta, url_tags });
export const blankBuild = (email: string): Build => ({
  dest: "", where: "new", campaign_id: "",
  c: { name: "", objective: "OUTCOME_LEADS", budget_level: "adset", daily_budget: "100", bid_strategy: "LOWEST_COST_WITHOUT_CAP", spend_cap: "" },
  s: { name: `Broad ${dm()} - ${staffName(email)}`, goal: "OFFSITE_CONVERSIONS", pixel_id: "", event: "COMPLETE_REGISTRATION", budget_type: "daily", budget: "100", start: "", end: "", bid_strategy: "LOWEST_COST_WITHOUT_CAP", bid_amount: "", attribution: "7c1v", audience: standardAudience() },
  ads: [],
  ai: { ...DEFAULT_AI },
});

/* ---------- Winners: what to copy from ---------- */
export type WinAd = { id: string; ad: string; status: string | null; ad_set_id: string; ad_set: string; campaign_id: string; campaign: string; destination_id: string | null; destination: string | null; country: string | null; spend: number; leads: number; clicks: number; impressions: number; days: number; proven: boolean };
export type WinSet = { id: string; ad_set: string; daily_budget: number | null; campaign_id: string; campaign: string; destination_id: string | null; destination: string | null; country: string | null; spend: number; leads: number; clicks: number; impressions: number; ads: number; proven: boolean };
export type Winners = { ads: WinAd[]; ad_sets: WinSet[] };

/* ---------- Calls ---------- */
export type Options = { ok: boolean; error?: string; identity: { page_id: string; instagram_user_id: string; url_tags: string; cta: string; link: string } | null; pixels: Pick[]; audiences: (Pick & { size: number })[]; creative_ok: boolean; creative_error: string };
export type SourceAd = { id: string; ad: string; copyable: boolean; error?: string; creative_id?: string; kind?: string; thumb?: string; message?: string; title?: string; description?: string; link?: string; cta?: string; url_tags?: string; image_hash?: string; video_id?: string };
export type SourceSet = { id: string; name: string; targeting: Record<string, unknown>; goal: string; bid_strategy: string; bid_amount: number | null; daily_budget: number | null; pixel_id: string; event: string; objective: string; campaign_budget: number | null; attribution: string };
type Reply = { ok: boolean; error?: string; [k: string]: unknown };

export async function builder<T = Reply>(body: Record<string, unknown>): Promise<T & { ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase is not connected in this build." } as T & Reply;
  const { data, error } = await supabase.functions.invoke("campaign-create", { body });
  if (error || !data) return { ok: false, error: error?.message ?? "No answer. Check the connection and try again." } as T & Reply;
  return data as T & Reply;
}

const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v as object) : []) as Record<string, unknown>[];
const KNOWN = ["geo_locations", "age_min", "age_max", "genders", "locales", "custom_audiences", "excluded_custom_audiences", "targeting_automation", "publisher_platforms", "facebook_positions", "instagram_positions", "messenger_positions", "audience_network_positions", "threads_positions", "whatsapp_positions", "device_platforms"];
const LOCALE_NAMES: Record<string, string> = { "41": "Malay", "6": "English (US)", "24": "English (UK)", "1001": "English (All)", "25": "Indonesian" };

/** Turns a copied Meta audience into the fields of the form. Anything the form has no field for is kept in `base`. */
export function audienceFrom(t: Record<string, unknown>, audiences: Pick[]): { audience: Audience; extras: string[] } {
  const geo = (t.geo_locations ?? {}) as Record<string, unknown>;
  const auto = (t.targeting_automation ?? {}) as Record<string, unknown>;
  const genders = list(t.genders).map(Number);
  const named = (x: Record<string, unknown>) => ({ id: String(x.id), name: String(x.name ?? audiences.find((a) => a.id === String(x.id))?.name ?? x.id) });
  const platforms = list(t.publisher_platforms).map(String);
  const base: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(t)) if (!KNOWN.includes(k)) base[k] = v;
  if (geo.location_types) base.geo_locations = { location_types: geo.location_types };
  const flex = list(base.flexible_spec);
  const interests = flex.flatMap((g) => list(g.interests)).map((x) => ({ id: String(x.id), name: String(x.name ?? x.id) }));
  const otherFlex = flex.flatMap((g) => Object.keys(g)).filter((k) => k !== "interests");
  const extras = [...Object.keys(base).filter((k) => !["geo_locations", "flexible_spec"].includes(k)), ...otherFlex].map((k) => k.replace(/_/g, " "));
  return {
    extras: Array.from(new Set(extras)),
    audience: {
      base,
      countries: list(geo.countries).map(String),
      regions: list(geo.regions).map((x) => ({ id: String(x.key), name: String(x.name ?? x.key) })),
      cities: list(geo.cities).map((x) => ({ id: String(x.key), name: String(x.name ?? x.key), radius: Number(x.radius) || 25 })),
      age_min: Number(t.age_min) || 18,
      age_max: Number(t.age_max) || 65,
      gender: genders.length === 1 ? (genders[0] === 1 ? "male" : "female") : "all",
      locales: list(t.locales).map((x) => ({ id: String(x), name: LOCALE_NAMES[String(x)] ?? `Language ${x}` })),
      interests,
      include: list(t.custom_audiences).map(named),
      exclude: list(t.excluded_custom_audiences).map(named),
      advantage: Number(auto.advantage_audience) === 1,
      placements: platforms.length
        ? { mode: "manual", platforms, facebook: list(t.facebook_positions).map(String), instagram: list(t.instagram_positions).map(String), devices: list(t.device_platforms).map(String).length ? list(t.device_platforms).map(String) : ["mobile", "desktop"] }
        : standardAudience().placements,
    },
  };
}

export function audienceLine(a: Audience): string {
  const where = [...a.countries.map((c) => COUNTRY_CHOICES.find((x) => x.v === c)?.t ?? c), ...a.regions.map((r) => r.name), ...a.cities.map((r) => r.name)].join(", ") || "no place chosen";
  const who = a.advantage ? `${Math.min(a.age_min, 25)}+` : `${a.age_min}–${a.age_max}${a.gender === "all" ? "" : `, ${a.gender === "male" ? "men" : "women"}`}`;
  const extra = [a.interests.length ? `${a.interests.length} interest${a.interests.length === 1 ? "" : "s"}` : "", a.include.length ? `${a.include.length} saved audience${a.include.length === 1 ? "" : "s"}` : "", a.exclude.length ? `${a.exclude.length} excluded` : ""].filter(Boolean).join(", ");
  return `${where} · ${who}${extra ? ` · ${extra}` : ""}${a.advantage ? " · Advantage+" : ""}`;
}

/** What still stops this form from being sent, in the order of the steps. Empty means ready. */
export function problems(b: Build, cbo: boolean): { step: number; text: string }[] {
  const out: { step: number; text: string }[] = [];
  if (b.where === "existing" && !b.campaign_id) out.push({ step: 1, text: "Choose the campaign to add the ad set to." });
  if (b.where === "new" && !b.c.name.trim()) out.push({ step: 2, text: "Give the campaign a name." });
  if (cbo && b.where === "new" && !(Number(b.c.daily_budget) >= 5)) out.push({ step: 2, text: "Enter the campaign's daily budget." });
  if (!b.s.name.trim()) out.push({ step: 3, text: "Give the ad set a name." });
  if (b.s.goal === "OFFSITE_CONVERSIONS" && (!b.s.pixel_id || !b.s.event)) out.push({ step: 3, text: "Choose the pixel and the event that counts as a result." });
  if (!cbo && !(Number(b.s.budget) >= 5)) out.push({ step: 3, text: "Enter the ad set's budget." });
  if (b.s.budget_type === "lifetime" && !cbo && !b.s.end) out.push({ step: 3, text: "A lifetime budget needs an end date." });
  const bid = cbo && b.where === "new" ? b.c.bid_strategy : b.s.bid_strategy;
  if (bid !== "LOWEST_COST_WITHOUT_CAP" && !(Number(b.s.bid_amount) > 0)) out.push({ step: 3, text: "Enter the amount for the bid strategy." });
  const a = b.s.audience;
  if (!a.countries.length && !a.regions.length && !a.cities.length) out.push({ step: 3, text: "Choose at least one place to show the ads in." });
  if (a.placements.mode === "manual" && !a.placements.platforms.length) out.push({ step: 3, text: "Manual placements: tick at least one platform." });
  if (b.ads.length === 0) out.push({ step: 4, text: "Add at least one ad." });
  b.ads.forEach((ad, i) => {
    const n = ad.name.trim() || `Ad ${i + 1}`;
    if (!ad.name.trim()) out.push({ step: 4, text: `Ad ${i + 1}: give it a name.` });
    if (ad.mode === "reuse") return;
    if (!ad.message.trim()) out.push({ step: 4, text: `${n}: write the ad text.` });
    if (!/^https:\/\//.test(ad.link.trim())) out.push({ step: 4, text: `${n}: the link must start with https://.` });
    if (ad.mode === "library" && !ad.media_id) out.push({ step: 4, text: `${n}: choose a picture or video.` });
  });
  return out;
}

const KEY = "mtb:build:v1";
export const loadSaved = (): Build | null => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Build) : null;
  } catch {
    return null;
  }
};
export const saveLocal = (b: Build | null) => {
  try {
    if (b) localStorage.setItem(KEY, JSON.stringify(b));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage is a convenience only */
  }
};

/** Said wherever Meta refuses an ad because the connected token has no advertiser access to the Facebook Page. */
export const PAGE_FIX =
  "Meta will not let this connection create ads for the Facebook Page yet. A campaign and its ad set can be created, but every ad is refused until this is fixed. In Meta Business Settings, under Accounts, Pages, open the Page and give the person or system user whose token is connected here the “Create ads” access. Do the same for the Instagram account.";
