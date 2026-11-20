// Fixed descriptions only. Every figure in the app comes from the database.
import type { AgentKey } from "../components/ui";

export type Staff = { who: AgentKey; name: string; role: string; kind: "Automation" | "AI"; job: string; starts: string };

export const STAFF: Staff[] = [
  { who: "data", name: "Dara", role: "Data Keeper", kind: "Automation", job: "Pulls campaigns, ads and spend from Meta every hour. Later: products and deposits from TravelCRM, and form leads.", starts: "Running" },
  { who: "ana", name: "Luqman", role: "Night Analyst", kind: "AI", job: "Studies every ad at night, checks what came of his earlier advice, writes lessons in his notebook and proposes changes for the morning.", starts: "Starts when an AI model is connected" },
  { who: "ads", name: "Adam", role: "Ads Manager", kind: "AI", job: "Makes a change in Meta when a person approves it: pauses an ad, ad set or campaign, or changes a daily budget. Never acts by himself.", starts: "On call: acts only when you approve" },
  { who: "plan", name: "Mira", role: "Campaign Planner", kind: "AI", job: "Drafts a new campaign when asked: picks the best campaign to copy, suggests a budget and writes the ad text. Creates it in Meta paused, only when you confirm.", starts: "On call: drafts when you ask" },
];

export const MODE_ROWS: { action: string; who: AgentKey; name: string; limit: string }[] = [
  { action: "Launch a new campaign", who: "plan", name: "Mira, Campaign Planner", limit: "Starting budget limit" },
  { action: "Raise ad set budget when under RM50 per pax", who: "ads", name: "Adam, Ads Manager", limit: "Daily increase limit" },
  { action: "Turn off ads over RM80 per pax", who: "ads", name: "Adam, Ads Manager", limit: "None" },
  { action: "Pause a product when all its dates are Fully Booked", who: "ads", name: "Adam, Ads Manager", limit: "None" },
];
