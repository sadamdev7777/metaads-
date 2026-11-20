// Fixed descriptions only. Every figure in the app comes from the database.
import type { AgentKey } from "../components/ui";

export type Staff = { who: AgentKey; name: string; job: string; starts: string };

export const STAFF: Staff[] = [
  { who: "data", name: "Data Keeper", job: "Pulls campaigns, ads and spend from Meta every hour. Later: products and deposits from TravelCRM, and form leads.", starts: "Running" },
  { who: "plan", name: "Campaign Planner", job: "Drafts new campaigns: objective, budget, audience and copy.", starts: "Starts in Phase 3" },
  { who: "ads", name: "Ads Manager", job: "Applies the RM50 and RM80 rules to running ads, with approval.", starts: "Starts in Phase 2" },
  { who: "ana", name: "Analyst", job: "Reports, budget and D-50 tracking, improvement ideas.", starts: "Starts in Phase 2" },
];

export const MODE_ROWS: { action: string; who: AgentKey; name: string; limit: string }[] = [
  { action: "Launch a new campaign", who: "plan", name: "Campaign Planner", limit: "Starting budget limit" },
  { action: "Raise ad set budget when under RM50 per pax", who: "ads", name: "Ads Manager", limit: "Daily increase limit" },
  { action: "Turn off ads over RM80 per pax", who: "ads", name: "Ads Manager", limit: "None" },
  { action: "Pause a product when all its dates are Fully Booked", who: "ads", name: "Ads Manager", limit: "None" },
];
