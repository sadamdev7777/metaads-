// Sample data for Phase 0. Every figure here is made up to show how the screens work.
// In Phase 1 these come from TravelCRM, Meta Ads and the website form through Supabase.
import type { AgentKey, AgentState, Tone } from "../components/ui";

export const TODAY_LABEL = "Thursday, 19 Nov. Data as of 10:05.";

export type Staff = { who: AgentKey; name: string; job: string; state: AgentState; now: string; last: string; next: string; mode: string };

export const STAFF: Staff[] = [
  { who: "data", name: "Data Keeper", job: "Loads products, dates and seats from TravelCRM. Pulls Meta cost and form leads. Matches deposits.", state: "work", now: "Loading seats from TravelCRM", last: "10:00, loaded 8 products and 32 dates.", next: "11:00", mode: "Read only" },
  { who: "plan", name: "Campaign Planner", job: "Drafts new campaigns: objective, budget, audience and copy.", state: "wait", now: "1 campaign draft sent for approval", last: "09:40, drafted Korea Autumn 20/11.", next: "after approval", mode: "Mode: Approval" },
  { who: "ads", name: "Ads Manager", job: "Applies the RM50 and RM80 rules to running ads.", state: "wait", now: "4 proposals sent at 09:30", last: "09:30, sent 4 proposals to WhatsApp.", next: "after approval", mode: "Mode: Approval" },
  { who: "ana", name: "Analyst", job: "Reports, budget and D-50 tracking, improvement ideas.", state: "work", now: "Drafting the weekly summary", last: "08:00, sent the daily report to WhatsApp.", next: "tomorrow 08:00", mode: "Read only" },
];

export type Approval = { id: string; tag: string; tone: Tone; target: string; from: AgentKey; reason: string; numbers: string };

export const APPROVALS: Approval[] = [
  { id: "a1", tag: "Launch campaign", tone: "t", target: "Korea Autumn 20/11 - AI", from: "plan", reason: "Korea Autumn has 44 open seats and no campaign.", numbers: "RM100 a day, 3 copy angles, 2 media files" },
  { id: "a2", tag: "Raise ad set budget", tone: "g", target: "Korea Spring 3/10 - AI › Broad PNG", from: "ads", reason: "Cost per pax is under the RM50 target.", numbers: "RM47 per pax. RM200 to RM240 a day (+20%)" },
  { id: "a3", tag: "Raise ad set budget", tone: "g", target: "KK Kundasang 23/9 - Staff B › Broad PNG", from: "ads", reason: "Cost per pax is under the RM50 target.", numbers: "RM45 per pax. RM120 to RM144 a day (+20%)" },
  { id: "a4", tag: "Turn off ad", tone: "r", target: "Turkiye 28/9 - Staff A › Broad PNG › PNG2", from: "ads", reason: "Cost per pax is over the limit after the close window.", numbers: "RM132 per pax, limit RM80, running 14 days" },
  { id: "a5", tag: "Turn off ad", tone: "r", target: "Danang 17/9 - Staff B › Broad MP4 › MP4 H2", from: "ads", reason: "CPL is over this product's CPL limit.", numbers: "CPL RM9.80, CPL limit RM2.40" },
];

export const TOTALS = { spendMonth: "RM61,200", budget: "RM100,000", pax: "812", cpp: "RM71.92", leadsMonth: "9,790", cpl: "RM6.25", budgetPct: 61, monthPct: 63 };

export type CountryRow = { country: string; products: string; campaigns: string; spend: string; leads: string; cpl: string; pax: string; cpp: string; st: Tone };
export const BY_COUNTRY: CountryRow[] = [
  { country: "Malaysia", products: "KK Kundasang", campaigns: "1", spend: "RM7,200", leads: "1,800", cpl: "RM4.00", pax: "160", cpp: "RM45.00", st: "g" },
  { country: "Korea", products: "Korea Spring, Korea Winter", campaigns: "2", spend: "RM26,400", leads: "3,840", cpl: "RM6.88", pax: "402", cpp: "RM65.67", st: "a" },
  { country: "Japan", products: "Japan Osaka Tokyo", campaigns: "1", spend: "RM11,400", leads: "1,500", cpl: "RM7.60", pax: "150", cpp: "RM76.00", st: "a" },
  { country: "Turkiye", products: "Turkiye", campaigns: "2", spend: "RM8,400", leads: "1,200", cpl: "RM7.00", pax: "70", cpp: "RM120.00", st: "r" },
  { country: "Vietnam", products: "Danang", campaigns: "1", spend: "RM5,000", leads: "1,000", cpl: "RM5.00", pax: "30", cpp: "RM166.67", st: "r" },
  { country: "Total", products: "", campaigns: "7", spend: "RM58,400", leads: "9,340", cpl: "RM6.25", pax: "812", cpp: "RM71.92", st: "a" },
];

export type WhoRow = { who: string; campaigns: string; spend: string; leads: string; cpl: string; pax: string; cpp: string; st: Tone };
export const BY_WHO: WhoRow[] = [
  { who: "AI", campaigns: "2", spend: "RM13,380", leads: "2,160", cpl: "RM6.19", pax: "239", cpp: "RM55.98", st: "a" },
  { who: "Staff B", campaigns: "2", spend: "RM12,200", leads: "2,800", cpl: "RM4.36", pax: "190", cpp: "RM64.21", st: "a" },
  { who: "Staff A", campaigns: "3", spend: "RM32,820", leads: "4,380", cpl: "RM7.49", pax: "383", cpp: "RM85.69", st: "r" },
  { who: "Total", campaigns: "7", spend: "RM58,400", leads: "9,340", cpl: "RM6.25", pax: "812", cpp: "RM71.92", st: "a" },
];

export type Dep = { name: string; days: string; filled: number; kpi: string; tone: Tone; open: string };
export const DEPARTURES_NEAR: Dep[] = [
  { name: "Korea Winter, 12 Jan", days: "D-54", filled: 28, kpi: "4 days to D-50", tone: "r", open: "12 seats open" },
  { name: "Japan Osaka Tokyo, 20 Jan", days: "D-62", filled: 25, kpi: "12 days to D-50", tone: "a", open: "15 seats open" },
  { name: "Korea Winter, 26 Jan", days: "D-68", filled: 22, kpi: "18 days to D-50", tone: "a", open: "18 seats open" },
];
export const KOREA_WINTER_DATES: Dep[] = [
  { name: "12 Jan", days: "D-54", filled: 28, kpi: "4 days to D-50", tone: "r", open: "12" },
  { name: "26 Jan", days: "D-68", filled: 22, kpi: "18 days to D-50", tone: "a", open: "18" },
  { name: "9 Feb", days: "D-82", filled: 31, kpi: "32 days to D-50", tone: "g", open: "9" },
  { name: "23 Feb", days: "D-96", filled: 40, kpi: "Fully Booked", tone: "n", open: "0" },
];

export const ATTENTION: { name: string; note: string; tone: Tone }[] = [
  { name: "Danang", note: "RM167 per pax", tone: "r" },
  { name: "Turkiye", note: "RM120 per pax", tone: "r" },
  { name: "Korea Winter 12 Jan", note: "4 days to D-50, 12 seats open", tone: "r" },
  { name: "Korea Autumn, Bandung", note: "Open seats, no campaign", tone: "a" },
];

export const NOTIFICATIONS: { bold: string; rest: string; to: string; cta: string }[] = [
  { bold: "3 campaigns are running in Meta but are not in the system.", rest: " Tag each one with its product and who ran it. 1 has no UTM.", to: "/campaigns", cta: "Tag now" },
  { bold: "1 ad was rejected by Meta.", rest: " Turkiye 12/10 - AI › Broad MP4 › MP4 1.", to: "/campaigns", cta: "See campaign" },
  { bold: "A budget was changed in Ads Manager.", rest: " Japan 24/9 - Staff A, RM250 to RM300 a day.", to: "/ai-office", cta: "See log" },
];

export type Product = { name: string; country: string; lp: string | null; dates: string; open: string; nearest?: { text: string; tone: Tone }; campaigns: string; cpp: string; st: Tone | null };
export const PRODUCTS: Product[] = [
  { name: "Korea Winter", country: "Korea", lp: "/korea-winter", dates: "4", open: "39", nearest: { text: "12 Jan: 4 days", tone: "r" }, campaigns: "1", cpp: "RM84.85", st: "r" },
  { name: "Korea Spring", country: "Korea", lp: "/korea-spring", dates: "5", open: "62", campaigns: "1", cpp: "RM47.06", st: "g" },
  { name: "Korea Autumn", country: "Korea", lp: "/korea-autumn", dates: "3", open: "44", campaigns: "0", cpp: "", st: null },
  { name: "KK Kundasang", country: "Malaysia", lp: "/kk-kundasang", dates: "6", open: "48", campaigns: "1", cpp: "RM45.00", st: "g" },
  { name: "Japan Osaka Tokyo", country: "Japan", lp: "/japan-osaka-tokyo", dates: "3", open: "35", nearest: { text: "20 Jan: 12 days", tone: "a" }, campaigns: "1", cpp: "RM76.00", st: "a" },
  { name: "Turkiye", country: "Turkiye", lp: "/turkiye", dates: "3", open: "70", campaigns: "2", cpp: "RM120.00", st: "r" },
  { name: "Danang", country: "Vietnam", lp: "/danang", dates: "4", open: "88", campaigns: "1", cpp: "RM166.67", st: "r" },
  { name: "Bandung", country: "Indonesia", lp: null, dates: "4", open: "60", campaigns: "0", cpp: "", st: null },
];

export type Media = { name: string; place: string; ratio: "9:16" | "4:5" | "1:1"; fmt: "PNG" | "MP4"; country: string | null; talent?: string; use: string; suggest?: string };
export const MEDIA: Media[] = [
  { name: "korea-spring-harga-flight.png", place: "Feed", ratio: "4:5", fmt: "PNG", country: "Korea", use: "Used in 1 campaign. RM44.00 per pax" },
  { name: "korea-spring-everland.png", place: "Feed", ratio: "4:5", fmt: "PNG", country: "Korea", use: "Used in 1 campaign. RM51.43 per pax" },
  { name: "korea-winter-h1.mp4", place: "Reels", ratio: "9:16", fmt: "MP4", country: "Korea", talent: "Talent A", use: "Used in 1 campaign. RM88.89 per pax" },
  { name: "korea-autumn-01.png", place: "Feed", ratio: "4:5", fmt: "PNG", country: "Korea", use: "Not used yet. Picked for the Korea Autumn draft" },
  { name: "korea-autumn-reel.mp4", place: "Reels", ratio: "9:16", fmt: "MP4", country: "Korea", talent: "Talent B", use: "Not used yet. Picked for the Korea Autumn draft" },
  { name: "kk-kundasang-01.png", place: "Feed", ratio: "1:1", fmt: "PNG", country: "Malaysia", use: "Used in 1 campaign. RM45.00 per pax" },
  { name: "danang-h2.mp4", place: "Reels", ratio: "9:16", fmt: "MP4", country: "Vietnam", talent: "Talent B", use: "Used in 1 campaign. Not enough data" },
  { name: "IMG_4471.png", place: "Feed", ratio: "4:5", fmt: "PNG", country: null, use: "", suggest: "Japan" },
];

export type Campaign = { id: string; name: string; product: string; runBy: string; system: boolean; delivery: { text: string; tone: Tone }; budget: string; cpp: string; st: Tone | null; draft?: boolean };
export const CAMPAIGNS: Campaign[] = [
  { id: "c0", name: "Korea Autumn 20/11 - AI", product: "Korea Autumn", runBy: "AI", system: true, delivery: { text: "Draft, awaiting approval", tone: "a" }, budget: "RM100", cpp: "", st: null, draft: true },
  { id: "c1", name: "Korea Spring 3/10 - AI", product: "Korea Spring", runBy: "AI", system: true, delivery: { text: "Delivering", tone: "g" }, budget: "RM200", cpp: "RM47.06", st: "g" },
  { id: "c2", name: "KK Kundasang 23/9 - Staff B", product: "KK Kundasang", runBy: "Staff B", system: false, delivery: { text: "Delivering", tone: "g" }, budget: "RM120", cpp: "RM45.00", st: "g" },
  { id: "c3", name: "Japan 24/9 - Staff A", product: "Japan Osaka Tokyo", runBy: "Staff A", system: false, delivery: { text: "Learning", tone: "n" }, budget: "RM300", cpp: "RM76.00", st: "a" },
  { id: "c4", name: "Korea Winter 5/10 - Staff A", product: "Korea Winter", runBy: "Staff A", system: false, delivery: { text: "Delivering", tone: "g" }, budget: "RM850", cpp: "RM84.85", st: "r" },
  { id: "c5", name: "Turkiye 12/10 - AI", product: "Turkiye", runBy: "AI", system: true, delivery: { text: "1 ad rejected", tone: "r" }, budget: "RM290", cpp: "RM108.00", st: "r" },
  { id: "c6", name: "Turkiye 28/9 - Staff A", product: "Turkiye", runBy: "Staff A", system: false, delivery: { text: "Delivering", tone: "g" }, budget: "RM330", cpp: "RM132.00", st: "r" },
  { id: "c7", name: "Danang 17/9 - Staff B", product: "Danang", runBy: "Staff B", system: false, delivery: { text: "Delivering", tone: "g" }, budget: "RM220", cpp: "RM166.67", st: "r" },
];

export type Untagged = { id: string; name: string; found: string; spend: string; product?: string; runBy?: string; note?: string; utm: boolean; action: string };
export const UNTAGGED: Untagged[] = [
  { id: "u1", name: "Korea Winter Promo 15/11 - Staff A", found: "Today 09:10", spend: "RM800", product: "Korea Winter", runBy: "Staff A", utm: true, action: "Confirm" },
  { id: "u2", name: "Wonderful Indonesia 13/11 - Staff A", found: "Yesterday", spend: "RM700", note: "Ad sets point to several products. Tag each ad set.", utm: true, action: "Tag ad sets" },
  { id: "u3", name: "Promo Hujung Tahun 1/11", found: "2 days ago", spend: "RM400", note: "No product or staff found in the name.", utm: false, action: "Choose product" },
];

export type TreeRow = { lv: 0 | 1 | 2 | 3; name: string; runBy?: string[]; fmt?: string; spend: string; leads: string; cpl: string; pax: string; cpp: string; st: Tone | null; action?: string; group?: string };
export const TREE: TreeRow[] = [
  { lv: 0, name: "Korea Spring", spend: "RM9,600", leads: "1,600", cpl: "RM6.00", pax: "204", cpp: "RM47.06", st: "g" },
  { lv: 1, name: "Korea Spring 3/10 - AI", runBy: ["AI"], spend: "RM9,600", leads: "1,600", cpl: "RM6.00", pax: "204", cpp: "RM47.06", st: "g" },
  { lv: 2, name: "Broad PNG 3/10", fmt: "PNG", spend: "RM9,600", leads: "1,600", cpl: "RM6.00", pax: "204", cpp: "RM47.06", st: "g", action: "Budget raise proposed" },
  { lv: 3, name: "C1 - Harga Termasuk Flight", fmt: "PNG", spend: "RM5,280", leads: "880", cpl: "RM6.00", pax: "120", cpp: "RM44.00", st: "g" },
  { lv: 3, name: "C2 - Sehari Di Everland", fmt: "PNG", spend: "RM4,320", leads: "720", cpl: "RM6.00", pax: "84", cpp: "RM51.43", st: "a" },
  { lv: 0, name: "Korea Winter", spend: "RM16,800", leads: "2,240", cpl: "RM7.50", pax: "198", cpp: "RM84.85", st: "r" },
  { lv: 1, name: "Korea Winter 5/10 - Staff A", runBy: ["Staff A"], spend: "RM16,800", leads: "2,240", cpl: "RM7.50", pax: "198", cpp: "RM84.85", st: "r" },
  { lv: 2, name: "Broad PNG 5/10", fmt: "PNG", spend: "RM12,000", leads: "1,600", cpl: "RM7.50", pax: "144", cpp: "RM83.33", st: "r", action: "In close window" },
  { lv: 3, name: "PNG1", fmt: "PNG", spend: "RM6,200", leads: "900", cpl: "RM6.89", pax: "92", cpp: "RM67.39", st: "a" },
  { lv: 3, name: "PNG2", fmt: "PNG", spend: "RM5,800", leads: "700", cpl: "RM8.29", pax: "52", cpp: "RM111.54", st: "r" },
  { lv: 2, name: "Broad MP4 Talent A 20/10", fmt: "MP4", spend: "RM4,800", leads: "640", cpl: "RM7.50", pax: "54", cpp: "RM88.89", st: "r", action: "In close window" },
  { lv: 3, name: "MP4 H1", fmt: "MP4", spend: "RM4,800", leads: "640", cpl: "RM7.50", pax: "54", cpp: "RM88.89", st: "r" },
  { lv: 0, name: "KK Kundasang", runBy: ["Staff B"], spend: "RM7,200", leads: "1,800", cpl: "RM4.00", pax: "160", cpp: "RM45.00", st: "g", action: "1 campaign" },
  { lv: 0, name: "Japan Osaka Tokyo", runBy: ["Staff A"], spend: "RM11,400", leads: "1,500", cpl: "RM7.60", pax: "150", cpp: "RM76.00", st: "a", action: "1 campaign" },
  { lv: 0, name: "Turkiye", runBy: ["Staff A", "AI"], spend: "RM8,400", leads: "1,200", cpl: "RM7.00", pax: "70", cpp: "RM120.00", st: "r", action: "2 campaigns" },
  { lv: 0, name: "Danang", runBy: ["Staff B"], spend: "RM5,000", leads: "1,000", cpl: "RM5.00", pax: "30", cpp: "RM166.67", st: "r", action: "Raised as a product issue" },
];

export const AGENT_LOG: { time: string; who: AgentKey; name: string; action: string; reason: string }[] = [
  { time: "10:05", who: "data", name: "Data Keeper", action: "Pulled Meta cost and form leads", reason: "Hourly schedule" },
  { time: "10:00", who: "data", name: "Data Keeper", action: "Loaded 8 products and 32 dates from TravelCRM", reason: "Load button pressed by Staff A" },
  { time: "09:40", who: "plan", name: "Campaign Planner", action: "Drafted campaign Korea Autumn 20/11 - AI", reason: "44 open seats, no campaign running" },
  { time: "09:30", who: "ads", name: "Ads Manager", action: "Proposed turning off Turkiye 28/9 - Staff A › Broad PNG › PNG2", reason: "RM132 per pax, over the RM80 limit, running 14 days" },
  { time: "09:30", who: "ads", name: "Ads Manager", action: "Proposed turning off Danang 17/9 - Staff B › Broad MP4 › MP4 H2", reason: "CPL RM9.80, over the CPL limit of RM2.40" },
  { time: "09:30", who: "ads", name: "Ads Manager", action: "Proposed raising budget for KK Kundasang 23/9 - Staff B › Broad PNG", reason: "RM45 per pax, under the RM50 target" },
  { time: "09:30", who: "ads", name: "Ads Manager", action: "Proposed raising budget for Korea Spring 3/10 - AI › Broad PNG", reason: "RM47 per pax, under the RM50 target" },
  { time: "09:20", who: "data", name: "Data Keeper", action: "Logged a change made outside the system: Japan 24/9 - Staff A budget RM250 to RM300", reason: "Changed in Ads Manager by Staff A" },
  { time: "09:10", who: "data", name: "Data Keeper", action: "Found 1 new campaign in Meta and suggested its tag: Korea Winter Promo 15/11 - Staff A", reason: "Hourly check of Meta. Read from the campaign name" },
  { time: "08:00", who: "ana", name: "Analyst", action: "Sent the daily report to WhatsApp", reason: "Daily schedule" },
];

export const MODE_ROWS: { action: string; who: AgentKey; name: string; limit: string }[] = [
  { action: "Launch a new campaign", who: "plan", name: "Campaign Planner", limit: "Starting budget limit" },
  { action: "Raise ad set budget when under RM50 per pax", who: "ads", name: "Ads Manager", limit: "Daily increase limit" },
  { action: "Turn off ads over RM80 per pax", who: "ads", name: "Ads Manager", limit: "None" },
  { action: "Pause a product when all its dates are Fully Booked", who: "ads", name: "Ads Manager", limit: "None" },
];

export const BUDGET: { country: string; planned: string; spent: string; pct: number; projected: string; status: string; tone: Tone }[] = [
  { country: "Korea", planned: "RM40,000", spent: "RM27,600", pct: 69, projected: "RM43,600", status: "Over plan", tone: "a" },
  { country: "Japan", planned: "RM18,000", spent: "RM12,000", pct: 67, projected: "RM18,900", status: "Over plan", tone: "a" },
  { country: "Turkiye", planned: "RM14,000", spent: "RM8,800", pct: 63, projected: "RM13,900", status: "On plan", tone: "g" },
  { country: "Malaysia", planned: "RM12,000", spent: "RM7,500", pct: 63, projected: "RM11,800", status: "On plan", tone: "g" },
  { country: "Vietnam", planned: "RM10,000", spent: "RM5,300", pct: 53, projected: "RM8,400", status: "On plan", tone: "g" },
  { country: "Indonesia", planned: "RM6,000", spent: "RM0", pct: 0, projected: "RM0", status: "Not started", tone: "n" },
];

export const LEAD_GAP: { country: string; meta: string; web: string; diff: string; gap: string; ok: boolean }[] = [
  { country: "Turkiye", meta: "1,290", web: "1,200", diff: "90", gap: "7.0%", ok: false },
  { country: "Japan", meta: "1,560", web: "1,500", diff: "60", gap: "3.8%", ok: true },
  { country: "Korea", meta: "3,980", web: "3,840", diff: "140", gap: "3.5%", ok: true },
  { country: "Malaysia", meta: "1,860", web: "1,800", diff: "60", gap: "3.2%", ok: true },
  { country: "Vietnam", meta: "1,030", web: "1,000", diff: "30", gap: "2.9%", ok: true },
  { country: "Total", meta: "9,720", web: "9,340", diff: "380", gap: "3.9%", ok: true },
];
