import { useEffect, useState } from "react";
import { NavLink, Navigate, useParams } from "react-router-dom";
import { Avatar, B, Bar, Btn, Card, Field, PageHead, Pill, Stat, T } from "../components/ui";
import { fetchActivity, type ActivityRow } from "../lib/activity";
import { useAuth } from "../lib/auth";
import { MODE_ROWS } from "../lib/data";
import { type Destination, analyst, count, fetchDestinations, rematch, removeDestination, rm, saveDestination, setDepartureDestination, useCampaigns, useDestinationCost, useMonthTotals, useUnknownDepartures, when } from "../lib/live";
import AdSchedule from "../components/AdSchedule";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { addStaff, listStaff, makePassword, resetStaffPassword, updateStaff, type StaffRow } from "../lib/staff";

const TABS = [
  { key: "rules", label: "Rules", sub: "AI staff follow these as soon as they are saved." },
  { key: "ad-schedule", label: "Ad schedule", sub: "Hours and dates when Alila pauses campaigns or lowers budgets, and puts them back." },
  { key: "destinations", label: "Destinations", sub: "Your own list. It decides which campaigns and TravelCRM packages count together." },
  { key: "budget", label: "Budget", sub: "Plan and track monthly spend by country." },
  { key: "integrations", label: "Integrations", sub: "Check that every connection the system depends on is working." },
  { key: "data-health", label: "Data Health", sub: "How far the numbers can be trusted." },
  { key: "users", label: "Users", sub: "Who can sign in, and a record of who did what." },
];

export default function Settings() {
  const { tab } = useParams();
  const current = TABS.find((t) => t.key === tab);
  if (!current) return <Navigate to="/settings/rules" replace />;

  return (
    <>
      <PageHead title="Settings" sub={`${current.label}: ${current.sub}`} />
      <nav aria-label="Settings sections" className="-mx-3 flex gap-0.5 overflow-x-auto border-b border-line px-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:gap-1 sm:px-0">
        {TABS.map((t) => (
          <NavLink
            key={t.key}
            to={`/settings/${t.key}`}
            className={({ isActive }) =>
              `flex min-h-[40px] flex-none items-center whitespace-nowrap border-b-[3px] px-2.5 text-[13px] no-underline sm:min-h-[44px] sm:px-4 sm:text-sm ${isActive ? "border-brand font-bold text-brand" : "border-transparent font-medium text-muted"}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      {tab === "rules" && <Rules />}
      {tab === "ad-schedule" && <AdSchedule />}
      {tab === "destinations" && <Destinations />}
      {tab === "budget" && <Budget />}
      {tab === "integrations" && <Integrations />}
      {tab === "data-health" && <DataHealth />}
      {tab === "users" && <Users />}
    </>
  );
}

/* ---------------- Rules ---------------- */

type RulesRow = {
  target_cost_per_pax: string;
  limit_cost_per_pax: string;
  monthly_budget: string;
  close_window_days: string;
  full_payment_days: string;
  min_pax_to_judge: string;
  max_budget_increase_pct: string;
  new_campaign_start_budget: string;
  daily_spend_limit: string;
  max_actions_per_day: string;
  lead_gap_alert_pct: string;
};
const DEFAULTS: RulesRow = {
  target_cost_per_pax: "50",
  limit_cost_per_pax: "80",
  monthly_budget: "100000",
  close_window_days: "7",
  full_payment_days: "50",
  min_pax_to_judge: "30",
  max_budget_increase_pct: "",
  new_campaign_start_budget: "",
  daily_spend_limit: "",
  max_actions_per_day: "",
  lead_gap_alert_pct: "",
};
const MODE_KEYS = ["launch_campaign", "raise_budget", "turn_off_ad", "pause_product"];

function Rules() {
  const { act } = useStore();
  const { user } = useAuth();
  const [r, setR] = useState<RulesRow>(DEFAULTS);
  const [modes, setModes] = useState<Record<string, string>>(Object.fromEntries(MODE_KEYS.map((k) => [k, "approval"])));
  const [source, setSource] = useState<"supabase" | "defaults">("defaults");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("rules")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const next = { ...DEFAULTS };
        (Object.keys(DEFAULTS) as (keyof RulesRow)[]).forEach((k) => {
          next[k] = data[k] === null || data[k] === undefined ? "" : String(Number(data[k]));
        });
        setR(next);
        if (data.action_modes) setModes(data.action_modes);
        setSource("supabase");
      });
  }, []);

  const set = (k: keyof RulesRow) => (v: string) => setR((x) => ({ ...x, [k]: v }));
  const numOrNull = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));

  async function save() {
    setSaving(true);
    let message = "Saved in this browser only. Supabase is not connected.";
    if (supabase) {
      const payload: Record<string, unknown> = { action_modes: modes, updated_at: new Date().toISOString() };
      (Object.keys(DEFAULTS) as (keyof RulesRow)[]).forEach((k) => (payload[k] = numOrNull(r[k])));
      const { data: sess } = await supabase.auth.getUser();
      payload.updated_by = sess.user?.id ?? null;
      const { error } = await supabase.from("rules").update(payload).eq("id", 1);
      message = error ? `Could not save: ${error.message}` : "Rules saved.";
    }
    setSaving(false);
    act(`Saved rules: target RM${r.target_cost_per_pax}, limit RM${r.limit_cost_per_pax}`, "Settings, Rules", message);
  }

  const todo = "Not decided yet. Leave empty until it is.";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-muted">
          {source === "supabase" ? "Loaded from the database." : "Showing default values."} Signed in as {user?.name}.
        </div>
        <Btn onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Btn>
      </div>

      <Card title="Cost and timing limits">
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:flex sm:flex-wrap sm:gap-4">
          <Field id="r1" label="Target cost per pax (RM)" value={r.target_cost_per_pax} onChange={set("target_cost_per_pax")} note="Below this, budget is raised" />
          <Field id="r2" label="Cost per pax limit (RM)" value={r.limit_cost_per_pax} onChange={set("limit_cost_per_pax")} note="Above this, the ad is turned off" />
          <Field id="r3" label="Monthly budget (RM)" value={r.monthly_budget} onChange={set("monthly_budget")} />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:flex sm:flex-wrap sm:gap-4">
          <Field id="r4" label="Close window (days)" value={r.close_window_days} onChange={set("close_window_days")} note="Starting assumption for all products" />
          <Field id="r5" label="Full payment (days before departure)" value={r.full_payment_days} onChange={set("full_payment_days")} note="KPI: departure full before this" />
          <Field id="r6" label="Minimum pax before an ad set is judged" value={r.min_pax_to_judge} onChange={set("min_pax_to_judge")} note="Suggested value, to confirm" />
        </div>
      </Card>

      <Card title="Action modes" sub="Each action type has its own switch. All start on Approval. Auto does nothing until Phase 4.">
        <T
          minW={880}
          heads={["Action", "AI staff", "Mode", "Who can approve", "Limit when Auto"]}
          rows={MODE_ROWS.map((m, i) => {
            const k = MODE_KEYS[i];
            return [
              <B>{m.action}</B>,
              <span className="inline-flex items-center gap-2">
                <Avatar who={m.who} state="idle" size={28} />
                <B>{m.name}</B>
              </span>,
              <span role="group" aria-label={`Mode for ${m.action}`} className="inline-flex overflow-hidden rounded-lg border border-[#9AA39E]">
                {["approval", "auto"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={modes[k] === v}
                    onClick={() => setModes((x) => ({ ...x, [k]: v }))}
                    className={`min-h-[36px] sm:min-h-[44px] px-3.5 text-[13px] font-semibold ${modes[k] === v ? "bg-brand text-white" : "bg-white text-ink"}`}
                  >
                    {v === "approval" ? "Approval" : "Auto"}
                  </button>
                ))}
              </span>,
              "Any staff",
              m.limit,
            ];
          })}
        />
      </Card>

      <Card title="Safety limits" sub="These are limits on the system and the AI staff, not on people. They are the only guard if something is approved by mistake.">
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:flex sm:flex-wrap sm:gap-4">
          <Field id="s1" label="Maximum budget increase per day (%)" value={r.max_budget_increase_pct} onChange={set("max_budget_increase_pct")} note={todo} />
          <Field id="s2" label="Starting budget for a new campaign (RM)" value={r.new_campaign_start_budget} onChange={set("new_campaign_start_budget")} note={todo} />
          <Field id="s3" label="Overall daily spend limit (RM)" value={r.daily_spend_limit} onChange={set("daily_spend_limit")} note={todo} />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:flex sm:flex-wrap sm:gap-4">
          <Field id="s4" label="Maximum actions per day" value={r.max_actions_per_day} onChange={set("max_actions_per_day")} note={todo} />
          <Field id="s5" label="Lead gap that triggers an alert (%)" value={r.lead_gap_alert_pct} onChange={set("lead_gap_alert_pct")} note={todo} />
          <div className="hidden min-w-[200px] flex-1 md:block" aria-hidden="true" />
        </div>
      </Card>
    </>
  );
}

/* ---------------- Destinations ---------------- */

const DEST_INPUT = "min-h-[40px] sm:min-h-[44px] w-full rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";
type DestDraft = { id?: string; name: string; country: string; keywords: string };

function Destinations() {
  const { user } = useAuth();
  const { act } = useStore();
  const [list, setList] = useState<Destination[]>([]);
  const [draft, setDraft] = useState<DestDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useCampaigns(30);
  const cost = useDestinationCost(30);
  const load = () => fetchDestinations().then(setList);
  useEffect(() => {
    void load();
  }, []);
  const unknown = useUnknownDepartures();
  const [savingDep, setSavingDep] = useState<number | null>(null);
  async function setDep(dep: number, destId: string) {
    const d = list.find((x) => x.id === destId);
    if (!d) return;
    setSavingDep(dep);
    const err = await setDepartureDestination(dep, d.id);
    setSavingDep(null);
    act(`Set TravelCRM departure ${dep} to ${d.name}${err ? " (failed)" : ""}`, "Settings, Destinations", err ?? `Saved. Departure ${dep} now counts under ${d.name}.`);
    if (!err) await Promise.all([unknown.reload(), cost.reload()]);
  }
  const unknownPax = unknown.data.reduce((n, r) => n + r.pax, 0);

  const unmatched = running.data.filter((c) => (c.delivery_status === "ACTIVE" || c.spend > 0) && !c.destination_id);
  const looseDeposits = (cost.data?.rows ?? []).filter((r) => !r.matched && r.pax > 0);
  const useCount = (d: Destination) => running.data.filter((c) => c.destination_id === d.id && (c.delivery_status === "ACTIVE" || c.spend > 0)).length;

  async function save() {
    if (!draft) return;
    const keywords = draft.keywords.split(",").map((k) => k.trim().toLowerCase()).filter((k) => k.length >= 3);
    if (!draft.name.trim() || !draft.country.trim()) return act("Tried to save a destination without a name or country", "Settings, Destinations", "Enter a name and a country.");
    setBusy(true);
    const err = await saveDestination({ id: draft.id, name: draft.name, country: draft.country, keywords }, user?.email ?? "");
    if (err) {
      setBusy(false);
      return act(`Saving destination ${draft.name} failed`, "Settings, Destinations", err.includes("duplicate") ? "A destination with that name already exists." : err);
    }
    const r = await rematch();
    setBusy(false);
    act(`${draft.id ? "Changed" : "Added"} destination ${draft.name}`, "Settings, Destinations", `Saved. ${r?.campaigns_changed ?? 0} campaigns and ${r?.departures_changed ?? 0} packages re-matched.`);
    setDraft(null);
    await Promise.all([load(), running.reload(), cost.reload()]);
  }
  async function remove(d: Destination) {
    setBusy(true);
    const err = await removeDestination(d.id);
    const r = err ? null : await rematch();
    setBusy(false);
    act(`Removed destination ${d.name}${err ? " (failed)" : ""}`, "Settings, Destinations", err ?? `Removed. ${r?.campaigns_changed ?? 0} campaigns re-matched.`);
    await Promise.all([load(), running.reload(), cost.reload()]);
  }

  const form = draft && (
    <Card title={draft.id ? "Change destination" : "New destination"}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <label htmlFor="dn" className="text-[13px] font-semibold">Name</label>
          <input id="dn" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Korea - Winter" className={DEST_INPUT} />
          <div className="text-xs text-muted">Shown in every report. Suggested form: Country - Destination.</div>
        </div>
        <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
          <label htmlFor="dc" className="text-[13px] font-semibold">Country</label>
          <input id="dc" list="countries" value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} placeholder="Korea" className={DEST_INPUT} />
          <datalist id="countries">
            {Array.from(new Set(list.map((d) => d.country))).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div className="text-xs text-muted">Destinations with the same country are added up together.</div>
        </div>
        <div className="flex min-w-[260px] flex-[2] flex-col gap-1.5">
          <label htmlFor="dk" className="text-[13px] font-semibold">Words to look for</label>
          <input id="dk" value={draft.keywords} onChange={(e) => setDraft({ ...draft, keywords: e.target.value })} placeholder="korea winter, winter korea" className={DEST_INPUT} />
          <div className="text-xs text-muted">Separate with commas. Looked for in campaign names and in TravelCRM package names. The longest match wins, so “korea winter” beats “korea”.</div>
        </div>
      </div>
      <div className="flex gap-2">
        <Btn disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save and re-match"}</Btn>
        <Btn kind="s" disabled={busy} onClick={() => setDraft(null)}>Cancel</Btn>
      </div>
    </Card>
  );

  return (
    <>
      <div className="rounded-xl bg-[#E6F1EE] px-3.5 py-3 sm:px-5 sm:py-4 text-sm">
        <B>How it works.</B> A campaign or a TravelCRM package belongs to a destination when its name contains the destination name or one of its
        words. Name new campaigns <B>Country - Destination date - Staff</B> (for example “Korea - Winter 1/12 - Haniss”) and they match by themselves.
        Change this list any time: every report follows.
      </div>

      {form}

      <Card title={`Destinations (${list.length})`} right={!draft ? <Btn onClick={() => setDraft({ name: "", country: "", keywords: "" })}>Add destination</Btn> : undefined} className="!p-3">
        <T
          minW={820}
          right={[3]}
          heads={["Destination", "Country", "Words to look for", "Running campaigns", ""]}
          rows={list.map((d) => [
            <B>{d.name}</B>,
            d.country,
            d.keywords.join(", "),
            count(useCount(d)),
            <span className="inline-flex gap-1.5">
              <Btn small kind="s" disabled={busy} onClick={() => setDraft({ id: d.id, name: d.name, country: d.country, keywords: d.keywords.join(", ") })}>Change</Btn>
              <Btn small kind="s" disabled={busy} onClick={() => void remove(d)}>Remove</Btn>
            </span>,
          ])}
        />
      </Card>

      <Card title="Deposits with no package" right={<Pill tone={unknown.data.length ? "a" : "g"}>{count(unknownPax)} pax in {unknown.data.length} departures</Pill>} className="!p-3">
        {unknown.data.length === 0 ? (
          <div className="px-2 text-sm">Every deposit belongs to a destination.</div>
        ) : (
          <>
            <div className="px-2 pb-2 text-sm">
              TravelCRM does not say which package these departures belong to. Open one of the bookings in TravelCRM to see the package, then pick the
              destination here. “Likely” is a hint from the nearest departure number we do know (TravelCRM numbers one package's departures in a
              run): check it before pressing Use. Biggest first. Each one is set once and remembered.
            </div>
            <T
              minW={900}
              right={[1, 2]}
              heads={["TravelCRM departure", "Bookings", "Pax", "Booking IDs to look up", "Booked", "Likely", "Destination"]}
              rows={unknown.data.map((r) => [
                <B>#{r.departure_id}</B>,
                count(r.bookings),
                count(r.pax),
                r.booking_ids.join(", "),
                r.first_date === r.last_date ? r.first_date.slice(5) : `${r.first_date.slice(5)} to ${r.last_date.slice(5)}`,
                r.package_name ? (
                  <span className="text-[13px] text-muted">Package “{r.package_name}” matches no destination. Add a word for it above.</span>
                ) : r.suggest_id ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span>{r.suggest_name}</span>
                    <Btn small kind="s" disabled={savingDep === r.departure_id} onClick={() => void setDep(r.departure_id, r.suggest_id!)}>Use</Btn>
                  </span>
                ) : (
                  <span className="text-muted">No hint</span>
                ),
                <select
                  aria-label={`Destination for departure ${r.departure_id}`}
                  value=""
                  disabled={savingDep === r.departure_id}
                  onChange={(e) => void setDep(r.departure_id, e.target.value)}
                  className="min-h-[40px] w-full max-w-[220px] rounded-lg border border-line bg-white px-2 text-sm"
                >
                  <option value="">{savingDep === r.departure_id ? "Saving…" : "Choose…"}</option>
                  {list.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>,
              ])}
            />
          </>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Campaigns not matched" right={<Pill tone={unmatched.length ? "a" : "g"}>{unmatched.length}</Pill>}>
          {unmatched.length === 0 ? (
            <div className="text-sm">Every running campaign has a destination.</div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
              {unmatched.slice(0, 30).map((c) => (
                <li key={c.id} className="flex justify-between gap-3 border-b border-line pb-1.5">
                  <span>{c.name}</span>
                  <span className="whitespace-nowrap text-muted">{c.spend ? rm(c.spend) : ""}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="text-[13px] text-muted">Add a destination or a word above, or set one by hand in Campaigns.</div>
        </Card>
        <Card title="Deposits not matched" right={<Pill tone={looseDeposits.length ? "a" : "g"}>{count(looseDeposits.reduce((n, r) => n + r.pax, 0))} pax</Pill>}>
          {looseDeposits.length === 0 ? (
            <div className="text-sm">Every deposit belongs to a destination.</div>
          ) : (
            <T minW={300} right={[1, 2]} heads={["Country in TravelCRM", "Bookings", "Pax"]} rows={looseDeposits.map((r) => [r.country === "Unknown" ? "Package not found" : r.country, count(r.bookings), count(r.pax)])} />
          )}
          <div className="text-[13px] text-muted">
            {cost.data?.bookings_without_package ? `${cost.data.bookings_without_package} of ${cost.data.bookings_stored} bookings have no package details yet. The nightly load looks them up; some TravelCRM answers “not found”.` : "Package details are loaded for every booking."}
          </div>
        </Card>
      </div>
    </>
  );
}

/* ---------------- Budget ---------------- */

function Budget() {
  const { data: t } = useMonthTotals();
  const now = new Date();
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const month = useCampaigns(day);
  const BUDGET_RM = 100000;
  const spent = t?.spend ?? 0;
  const projected = day > 0 ? (spent / day) * daysInMonth : 0;
  const pct = Math.round((spent / BUDGET_RM) * 100);
  const groups = new Map<string, number>();
  for (const c of month.data) if (c.spend > 0) groups.set(c.country ?? "Not tagged", (groups.get(c.country ?? "Not tagged") ?? 0) + c.spend);
  const rows = Array.from(groups.entries()).sort((x, y) => y[1] - x[1]);
  return (
    <>
      <div className="flex flex-wrap gap-4">
        <Stat label="Budget this month" value={rm(BUDGET_RM)} sub={now.toLocaleDateString("en-MY", { month: "long" })} />
        <Stat label="Spent so far" value={t ? rm(spent) : "…"} sub={`day ${day} of ${daysInMonth}`} />
        <Stat label="Projected month end" value={t ? rm(projected) : "…"} sub="at the average daily rate so far" />
      </div>
      <Card title="Budget used">
        <Bar pct={Math.min(pct, 100)} label={`${pct} percent of budget used`} />
        <div className="text-sm">
          {pct}% used, {Math.round((day / daysInMonth) * 100)}% of the month gone.
        </div>
      </Card>
      <Card title="Spend this month by country" sub="From the country tag on each campaign. A plan for each country can be set once tagging is complete.">
        <T minW={420} right={[1, 2]} heads={["Country", "Spent so far", "Share"]} rows={rows.map(([k, v]) => [<B>{k}</B>, rm(v), spent > 0 ? `${Math.round((v / spent) * 100)}%` : ""])} />
        {!month.loading && rows.length === 0 && <div className="text-sm text-muted">No spend recorded this month yet.</div>}
      </Card>
    </>
  );
}

/* ---------------- Integrations ---------------- */

type MetaAccount = { id: string; name: string; active: boolean; currency: string };
type Integ = {
  key: string;
  name: string;
  used_for: string;
  status: "connected" | "check" | "not_set_up";
  detail: string;
  secret_hint?: string | null;
  updated_by_email?: string | null;
  last_checked_at?: string | null;
  config?: ({ accounts?: MetaAccount[]; selected?: string[] } & Record<string, unknown>) | null;
};
const FALLBACK: Integ[] = [
  { key: "travelcrm", name: "TravelCRM", used_for: "Products, dates, seats and deposits.", status: "not_set_up", detail: "Waiting for the TravelCRM MCP to be installed. Phase 1." },
  { key: "meta_ads", name: "Meta Ads", used_for: "Campaigns, spend, and launching or changing ads.", status: "not_set_up", detail: "Not connected to this system yet. Phase 1 reads, Phase 2 writes." },
  { key: "website_form", name: "MTB website form", used_for: "Leads with the product picked and the campaign UTM.", status: "not_set_up", detail: "How the system reads form data is not confirmed yet. Phase 1." },
  { key: "whatsapp", name: "WhatsApp", used_for: "Daily report and approval messages.", status: "not_set_up", detail: "Sending channel not chosen yet. Phase 4." },
  { key: "meta_capi", name: "Meta Conversions API", used_for: "Sends deposits back to Meta so it learns who pays.", status: "not_set_up", detail: "Phase 4." },
  { key: "mailgun", name: "Mailgun", used_for: "Email to leads that did not close.", status: "not_set_up", detail: "Planned for later, replaces Brevo." },
];

const statusPill = (s: Integ["status"]) =>
  s === "connected" ? <Pill tone="g">Connected</Pill> : s === "check" ? <Pill tone="a">Check</Pill> : <Pill>Not set up</Pill>;

function Integrations() {
  const { act } = useStore();
  const [rows, setRows] = useState<Integ[]>(FALLBACK);
  const [db, setDb] = useState<{ ok: boolean; detail: string }>({ ok: false, detail: supabase ? "Checking…" : "Environment variables are not set in this build." });

  async function load(log: boolean) {
    if (!supabase) return;
    const started = performance.now();
    const { data, error } = await supabase
      .from("integration_status")
      .select("key, name, used_for, status, detail, secret_hint, updated_by_email, last_checked_at, config")
      .order("name");
    const ms = Math.round(performance.now() - started);
    if (error) setDb({ ok: false, detail: `Query failed: ${error.message}` });
    else {
      setDb({ ok: true, detail: `Database answered in ${ms} ms. Sign-in and activity log are live.` });
      if (data && data.length) setRows(data as Integ[]);
    }
    if (log) act("Tested the Supabase connection", "Settings, Integrations", error ? "Supabase test failed." : "Supabase is connected.");
  }

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const working = rows.filter((r) => r.status === "connected").length + (db.ok ? 1 : 0);
  const [showLater, setShowLater] = useState(false);
  const later = rows.filter((r) => r.status === "not_set_up" && r.key !== "travelcrm");
  const cardFor = (r: Integ) =>
          r.key === "meta_ads" ? (
            <MetaAdsCard key={r.key} row={r} reload={() => load(false)} />
          ) : r.key === "ai_model" ? (
            <AiModelCard key={r.key} row={r} reload={() => load(false)} />
          ) : r.key === "travelcrm" ? (
            <TravelCrmCard key={r.key} row={r} />
          ) : r.key === "website_form" ? (
            <WebsiteFormCard key={r.key} row={r} reload={() => load(false)} />
          ) : CONNECT[r.key] ? (
            <SimpleConnect key={r.key} row={r} reload={() => load(false)} />
          ) : (
            <Card key={r.key} title={r.name} right={statusPill(r.status)}>
              <div className="text-sm">{r.used_for}</div>
              <div className="text-[13px] text-muted">{r.detail}</div>
              <div className="mt-auto flex justify-end">
                <Btn kind="s" onClick={() => act(`Opened setup for ${r.name}`, "Settings, Integrations", `${r.name} is on hold for now.`)}>
                  On hold
                </Btn>
              </div>
            </Card>
          );

  return (
    <>
      <Card>
        <div className="text-[15px] font-bold">
          {working} of {rows.length + 1} connections are working
        </div>
        <div className="text-[13px] text-muted">
          This is the real status. If a required connection fails, Auto mode stops and returns to Approval.
        </div>
      </Card>
      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <Card title="Supabase" right={db.ok ? <Pill tone="g">Connected</Pill> : <Pill tone="r">Not connected</Pill>}>
          <div className="text-sm">Database, sign-in and activity log.</div>
          <div className="text-[13px] text-muted">{db.detail}</div>
          <div className="mt-auto flex justify-end">
            <Btn kind="s" onClick={() => void load(true)} disabled={!supabase}>
              Test connection
            </Btn>
          </div>
        </Card>
        {rows.filter((r) => r.status !== "not_set_up" || r.key === "travelcrm").map(cardFor)}
      </div>
      {later.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-dashed border-[#9AA39E] bg-white px-3.5 py-3 sm:px-5 sm:py-4">
          <button type="button" aria-expanded={showLater} onClick={() => setShowLater(!showLater)} className="flex w-full items-center justify-between gap-3 border-0 bg-transparent p-0 text-left">
            <span className="min-w-0">
              <span className="block text-[15px] font-bold">Not set up yet ({later.length})</span>
              <span className="block text-[12px] text-muted sm:text-[13px]">{later.map((r) => r.name).join(", ")}</span>
            </span>
            <span className="flex-none text-[13px] font-semibold text-brand">{showLater ? "Hide" : "Set up"}</span>
          </button>
          {showLater && <div className="grid gap-3 sm:gap-4 md:grid-cols-2">{later.map(cardFor)}</div>}
        </section>
      )}
    </>
  );
}

/** TravelCRM: closed bookings are loaded each night by a Claude scheduled task, so there is no key to enter here. */
function TravelCrmCard({ row }: { row: Integ }) {
  const cost = useDestinationCost(30);
  const d = cost.data;
  const fresh = d?.last_synced ? Date.now() - new Date(d.last_synced).getTime() < 36 * 3600000 : false;
  return (
    <Card title="TravelCRM" right={statusPill(d ? (fresh ? "connected" : d.bookings_stored ? "check" : "not_set_up") : row.status)} className="md:col-span-2">
      <div className="text-sm">Closed bookings (paid deposit and full payment), used to work out cost per pax deposit by destination.</div>
      <div className="flex flex-wrap gap-4">
        <Stat label="Last load" value={when(d?.last_synced)} sub={fresh ? "Every night at 00:45" : "Expected every night at 00:45"} />
        <Stat label="Bookings stored" value={d ? count(d.bookings_stored) : "…"} sub={d?.first_booking_date ? `from ${d.first_booking_date}` : ""} />
        <Stat label="No package details" value={d ? count(d.bookings_without_package) : "…"} sub="counted as unknown" />
      </div>
      {d && !fresh && d.bookings_stored > 0 && (
        <div className="rounded-lg bg-[#FBEFD5] px-3 py-2 text-[13px]">The last load is more than 36 hours old. The nightly task may have failed: check the scheduled task in Claude.</div>
      )}
      <div className="text-[13px] text-muted">
        Connected through the TravelCRM connector on the owner's Claude account, not with a key in this system. A scheduled task in Claude reads new
        bookings each night and saves them here. No customer names, emails or full phone numbers are stored. To stop it, pause the task “MTB: tarik
        deposit TravelCRM setiap malam” in Claude.
      </div>
    </Card>
  );
}

/** Meta Ads: the token is typed here once, checked against Meta, stored encrypted, and never shown again. */
function MetaAdsCard({ row, reload }: { row: Integ; reload: () => Promise<void> }) {
  const { act } = useStore();
  const [token, setToken] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const accounts = row.config?.accounts ?? [];
  const [picked, setPicked] = useState<string[]>(row.config?.selected ?? []);
  const hasToken = Boolean(row.secret_hint);

  useEffect(() => {
    setPicked(row.config?.selected ?? []);
  }, [row.config]);

  async function call(action: string, extra: Record<string, unknown>, logText: string, okText: string) {
    if (!supabase) {
      setMsg({ ok: false, text: "Supabase is not connected in this build." });
      return false;
    }
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.functions.invoke("meta-connect", { body: { action, ...extra } });
    setBusy(false);
    const ok = !error && data?.ok === true;
    const text = ok ? okText : data?.error || error?.message || "Something went wrong.";
    setMsg({ ok, text });
    act(`${logText}${ok ? "" : " (failed)"}`, "Settings, Integrations", text);
    await reload();
    return ok;
  }

  async function saveToken() {
    const t = token.trim();
    if (!t) return setMsg({ ok: false, text: "Paste the access token first." });
    const ok = await call("save_token", { token: t }, `Saved a Meta access token ending ${t.slice(-4)}`, "Token checked with Meta and saved. Now choose the ad accounts.");
    if (ok) {
      setToken("");
      setEditing(false);
    }
  }

  const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never");
  const input = "min-h-[40px] sm:min-h-[44px] w-full rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";

  return (
    <Card title="Meta Ads" right={statusPill(row.status)} className="md:col-span-2">
      <div className="text-sm">{row.used_for}</div>
      <div className="text-[13px] text-muted">{row.detail}</div>

      {hasToken && !editing ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ground px-3 py-2.5 text-sm">
          <div>
            <B>Token saved</B>, ending in <span className="font-mono">••••{row.secret_hint}</span>. Saved by {row.updated_by_email || "unknown"}. Last checked{" "}
            {when(row.last_checked_at)}.
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn small kind="s" disabled={busy} onClick={() => void call("test", {}, "Tested the Meta Ads connection", "Meta accepted the stored token.")}>
              Test connection
            </Btn>
            <Btn small kind="s" disabled={busy} onClick={() => setEditing(true)}>
              Replace token
            </Btn>
            <Btn small kind="s" disabled={busy} onClick={() => void call("disconnect", {}, "Disconnected Meta Ads", "Disconnected. The token was removed.")}>
              Disconnect
            </Btn>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <ol className="m-0 list-decimal pl-5 text-[13px] text-muted">
            <li>In Meta Business Settings, create a system user and assign it the ad account with View performance.</li>
            <li>Generate a token for that system user with the ads_read permission.</li>
            <li>Paste it here. It is checked with Meta, stored encrypted, and never shown again.</li>
          </ol>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
              <label htmlFor="meta-token" className="text-[13px] font-semibold">
                System user access token
              </label>
              <input id="meta-token" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} className={input} />
            </div>
            <Btn disabled={busy} onClick={() => void saveToken()}>
              {busy ? "Checking with Meta…" : "Save and test"}
            </Btn>
            {editing && (
              <Btn kind="s" disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </Btn>
            )}
          </div>
        </div>
      )}

      {msg && (
        <div role="status" className={`rounded-lg px-3 py-2 text-[13px] font-semibold ${msg.ok ? "bg-[#E3F2E9] text-[#17663F]" : "bg-[#FBE6E3] text-[#A3231B]"}`}>
          {msg.text}
        </div>
      )}

      {hasToken && accounts.length > 0 && (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-[13px] font-semibold">Ad accounts to load into the system</legend>
          {accounts.map((a) => (
            <label key={a.id} className="flex min-h-[36px] sm:min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-line px-3">
              <input
                type="checkbox"
                className="h-[18px] w-[18px]"
                checked={picked.includes(a.id)}
                onChange={() => setPicked((p) => (p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id]))}
              />
              <span className="flex-1 text-sm">
                <B>{a.name}</B> <span className="font-mono text-[13px] text-muted">{a.id}</span>
              </span>
              <Pill tone={a.active ? "g" : "n"}>{a.active ? "Active" : "Not active"}</Pill>
            </label>
          ))}
          <div>
            <Btn
              kind="s"
              disabled={busy}
              onClick={() =>
                void call(
                  "set_accounts",
                  { account_ids: picked },
                  `Selected ${picked.length} Meta ad account${picked.length === 1 ? "" : "s"}`,
                  `${picked.length} ad account${picked.length === 1 ? "" : "s"} selected.`,
                )
              }
            >
              Save ad accounts
            </Btn>
          </div>
        </fieldset>
      )}
      <p className="m-0 text-[13px] text-muted">The system can pause, change budgets and create ads in Meta. Anything new it creates starts paused until a person turns it on.</p>
    </Card>
  );
}

type FieldDef = { name: string; label: string; secret?: boolean; note?: string; placeholder?: string; options?: string[] };
const CONNECT: Record<string, { steps: string[]; fields: FieldDef[]; summary: (c: Record<string, unknown>) => string }> = {
  whatsapp: {
    steps: [
      "In Meta Business Settings, give a system user access to the WhatsApp account and generate a token with whatsapp_business_messaging.",
      "In WhatsApp Manager, copy the Phone number ID of the number that will send the messages.",
      "List the numbers that should receive the daily report and approvals.",
    ],
    fields: [
      { name: "token", label: "WhatsApp access token", secret: true },
      { name: "phone_number_id", label: "Phone number ID", placeholder: "Numbers only", note: "The ID from WhatsApp Manager, not the phone number" },
      { name: "recipients", label: "Recipients", placeholder: "60123456789, 60198765432", note: "Country code first, separated by commas" },
    ],
    summary: (c) => `Sends from ${c.verified_name ?? ""} ${c.display_phone_number ?? ""}. Recipients: ${((c.recipients as string[]) ?? []).join(", ") || "none yet"}.`,
  },
  meta_capi: {
    steps: [
      "In Meta Events Manager, open the dataset (pixel) used on the MTB website and copy its ID.",
      "Leave the token empty to use the Meta Ads token, or paste a Conversions API token generated in Events Manager.",
    ],
    fields: [
      { name: "dataset_id", label: "Dataset (pixel) ID", placeholder: "Numbers only" },
      { name: "token", label: "Conversions API token (optional)", secret: true, note: "Empty means the Meta Ads token is used" },
    ],
    summary: (c) => `Dataset ${c.name ?? ""} (${c.dataset_id ?? ""}), using ${c.token_source === "own" ? "its own token" : "the Meta Ads token"}.`,
  },
  mailgun: {
    steps: [
      "In Mailgun, open Sending, then Domain settings, and create a Sending API key for the domain.",
      "Enter the sending domain exactly as shown in Mailgun, and the region the domain was created in.",
    ],
    fields: [
      { name: "api_key", label: "Mailgun API key", secret: true },
      { name: "domain", label: "Sending domain", placeholder: "mg.example.com" },
      { name: "region", label: "Region", options: ["US", "EU"] },
    ],
    summary: (c) => `Domain ${c.domain ?? ""}, region ${c.region ?? ""}.`,
  },
};

const whenText = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never");
const INPUT_CLS = "min-h-[40px] sm:min-h-[44px] w-full rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";

function useConnect(key: string, reload: () => Promise<void>) {
  const { act } = useStore();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function call(action: string, extra: Record<string, unknown>, logText: string, okText: string) {
    if (!supabase) {
      setMsg({ ok: false, text: "Supabase is not connected in this build." });
      return null;
    }
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.functions.invoke("integration-connect", { body: { integration: key, action, ...extra } });
    setBusy(false);
    const ok = !error && data?.ok === true;
    const text = ok ? okText : data?.error || error?.message || "Something went wrong.";
    setMsg({ ok, text });
    act(`${logText}${ok ? "" : " (failed)"}`, "Settings, Integrations", text);
    await reload();
    return ok ? (data as Record<string, unknown>) : null;
  }
  const note = msg && (
    <div role="status" className={`rounded-lg px-3 py-2 text-[13px] font-semibold ${msg.ok ? "bg-[#E3F2E9] text-[#17663F]" : "bg-[#FBE6E3] text-[#A3231B]"}`}>{msg.text}</div>
  );
  return { busy, call, note };
}

/** WhatsApp, Meta Conversions API and Mailgun: type the details once, they are checked and stored encrypted. */
function SimpleConnect({ row, reload }: { row: Integ; reload: () => Promise<void> }) {
  const def = CONNECT[row.key];
  const cfg = (row.config ?? {}) as Record<string, unknown>;
  const { busy, call, note } = useConnect(row.key, reload);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const connected = Boolean(row.secret_hint);

  function startEdit() {
    const next: Record<string, string> = {};
    def.fields.forEach((f) => {
      if (f.secret) return;
      const v = cfg[f.name];
      next[f.name] = Array.isArray(v) ? v.join(", ") : v ? String(v) : "";
    });
    setValues(next);
    setEditing(true);
  }
  async function save() {
    const payload: Record<string, string> = {};
    def.fields.forEach((f) => (payload[f.name] = values[f.name] ?? (f.options ? f.options[0] : "")));
    const done = await call("save", payload, `Saved the ${row.name} connection`, `${row.name} checked and saved.`);
    if (done) {
      setValues({});
      setEditing(false);
    }
  }

  return (
    <Card title={row.name} right={statusPill(row.status)} className="md:col-span-2">
      <div className="text-sm">{row.used_for}</div>
      <div className="text-[13px] text-muted">{row.detail}</div>
      {connected && !editing ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ground px-3 py-2.5 text-sm">
          <div>
            {def.summary(cfg)} Key ending <span className="font-mono">••••{row.secret_hint}</span>, saved by {row.updated_by_email || "unknown"}. Last checked {whenText(row.last_checked_at)}.
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn small kind="s" disabled={busy} onClick={() => void call("test", {}, `Tested the ${row.name} connection`, `${row.name} is working.`)}>
              Test connection
            </Btn>
            <Btn small kind="s" disabled={busy} onClick={startEdit}>
              Edit
            </Btn>
            <Btn small kind="s" disabled={busy} onClick={() => void call("disconnect", {}, `Disconnected ${row.name}`, "Disconnected. The key was removed.")}>
              Disconnect
            </Btn>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ol className="m-0 list-decimal pl-5 text-[13px] text-muted">
            {def.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <div className="flex flex-wrap items-start gap-3">
            {def.fields.map((f) => {
              const id = `${row.key}-${f.name}`;
              return (
                <div key={f.name} className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                  <label htmlFor={id} className="text-[13px] font-semibold">
                    {f.label}
                  </label>
                  {f.options ? (
                    <select id={id} className={INPUT_CLS} value={values[f.name] ?? f.options[0]} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}>
                      {f.options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      type={f.secret ? "password" : "text"}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={editing && f.secret ? "Leave empty to keep the saved one" : f.placeholder}
                      value={values[f.name] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      className={INPUT_CLS}
                    />
                  )}
                  {f.note && <div className="text-xs text-muted">{f.note}</div>}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Btn disabled={busy} onClick={() => void save()}>
              {busy ? "Checking…" : "Save and test"}
            </Btn>
            {editing && (
              <Btn kind="s" disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </Btn>
            )}
          </div>
        </div>
      )}
      {note}
    </Card>
  );
}

/** Website form: the system gives the website an address and a key, and the website sends each lead there. */
function WebsiteFormCard({ row, reload }: { row: Integ; reload: () => Promise<void> }) {
  const { busy, call, note } = useConnect("website_form", reload);
  const [fresh, setFresh] = useState<string | null>(null);
  const hasKey = Boolean(row.secret_hint);
  const hookUrl = (row.config as { url?: string } | null)?.url ?? `${import.meta.env.VITE_SUPABASE_URL ?? "https://<project>.supabase.co"}/functions/v1/leads-webhook`;
  const sample = `POST ${hookUrl}
x-webhook-key: ${fresh ?? (hasKey ? `••••${row.secret_hint}` : "<your key>")}
Content-Type: application/json

{
  "phone": "0123456789",
  "product": "Korea Winter",
  "utm_source": "facebook",
  "utm_campaign": "korea-winter-0510",
  "utm_content": "PNG1",
  "submitted_at": "2026-11-20T10:00:00+08:00"
}`;

  async function generate() {
    const data = await call("generate_key", {}, hasKey ? "Replaced the website form webhook key" : "Created a website form webhook key", "Key created. Copy it now: it is not shown again.");
    if (data?.key) setFresh(String(data.key));
  }

  return (
    <Card title={row.name} right={statusPill(row.status)} className="md:col-span-2">
      <div className="text-sm">{row.used_for}</div>
      <div className="text-[13px] text-muted">{row.detail}</div>
      <ol className="m-0 list-decimal pl-5 text-[13px] text-muted">
        <li>Create a key here.</li>
        <li>In the website, after a form is submitted, have the server send the lead to the address below with the key. Never put the key in browser code.</li>
        <li>Submit one form on the website, then press Check for leads.</li>
      </ol>
      {fresh && (
        <div className="rounded-lg bg-[#FBEFD5] px-3 py-2.5 text-sm text-[#5C3900]">
          <div className="font-bold">Copy this key now. It is not shown again.</div>
          <div className="mt-1 break-all font-mono text-[13px]">{fresh}</div>
        </div>
      )}
      <pre className="m-0 max-w-full overflow-x-auto rounded-lg bg-ground p-3 text-[12px] leading-relaxed">{sample}</pre>
      <div className="text-[13px] text-muted">
        Only <span className="font-mono">phone</span> is required. Send <span className="font-mono">product</span> exactly as the product is named in TravelCRM, and{" "}
        <span className="font-mono">utm_campaign</span> exactly as it arrives from the ad, so leads match the right product and campaign.
        {hasKey && ` Current key ends ••••${row.secret_hint}, created by ${row.updated_by_email || "unknown"}.`}
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn kind={hasKey ? "s" : "p"} disabled={busy} onClick={() => void generate()}>
          {hasKey ? "Create a new key" : "Create key"}
        </Btn>
        {hasKey && (
          <>
            <Btn kind="s" disabled={busy} onClick={() => void call("test", {}, "Checked for leads from the website form", "Checked.")}>
              Check for leads
            </Btn>
            <Btn kind="s" disabled={busy} onClick={() => void call("disconnect", {}, "Disconnected the website form", "Disconnected. The key no longer works.")}>
              Disconnect
            </Btn>
          </>
        )}
      </div>
      {note}
    </Card>
  );
}

const AI_ROLES = [
  { agent: "analyst", label: "Luqman, Night Analyst", why: "Suggested: claude-opus-5-5. One deep study a night, so the strongest thinking is worth it here." },
  { agent: "ads", label: "Adam, Ads Manager", why: "Suggested: claude-haiku-5-5. Frequent, simple checks against the rules: small and fast is enough. Not running yet." },
  { agent: "planner", label: "Mira, Campaign Planner", why: "Suggested: claude-sonnet-5-5. Writing copy and drafts needs quality without the top price. Not running yet." },
];

/** AI model: the Anthropic API key Luqman thinks with. Checked by listing models, which costs nothing. */
function AiModelCard({ row, reload }: { row: Integ; reload: () => Promise<void> }) {
  const { act } = useStore();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cfg = (row.config ?? {}) as { model?: string; models?: string[]; agents?: Record<string, string> };
  const connected = Boolean(row.secret_hint);

  async function call(action: string, extra: Record<string, unknown>, logText: string, okText: string) {
    setBusy(true);
    setMsg(null);
    const r = await analyst(action, extra);
    setBusy(false);
    setMsg({ ok: r.ok, text: r.ok ? okText : r.error ?? "Something went wrong." });
    act(`${logText}${r.ok ? "" : " (failed)"}`, "Settings, Integrations", r.ok ? okText : r.error);
    if (r.ok) setKey("");
    await reload();
  }

  return (
    <Card title="AI model" right={statusPill(row.status)} className="md:col-span-2">
      <div className="text-sm">{row.used_for}</div>
      <div className="text-[13px] text-muted">{row.detail}</div>
      {connected ? (
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg bg-ground px-3 py-2.5 text-sm">
          <div className="flex min-w-[260px] flex-1 flex-col gap-3">
            {AI_ROLES.map((r) => (
              <div key={r.agent} className="flex flex-col gap-1.5">
                <label htmlFor={`ai-model-${r.agent}`} className="text-[13px] font-semibold">
                  {r.label}
                </label>
                <select
                  id={`ai-model-${r.agent}`}
                  value={cfg.agents?.[r.agent] ?? cfg.model ?? ""}
                  disabled={busy}
                  onChange={(e) => void call("set_model", { agent: r.agent, model: e.target.value }, `Changed the model for ${r.label} to ${e.target.value}`, "Model changed.")}
                  className={INPUT_CLS}
                >
                  {(cfg.models ?? []).map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <div className="text-xs text-muted">{r.why}</div>
              </div>
            ))}
            <div className="text-xs text-muted">
              One key for all three. Key ending <span className="font-mono">••••{row.secret_hint}</span>, saved by {row.updated_by_email || "unknown"}.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn small kind="s" disabled={busy} onClick={() => void call("test", {}, "Tested the AI model connection", "The key works.")}>
              Test connection
            </Btn>
            <Btn small kind="s" disabled={busy} onClick={() => void call("disconnect", {}, "Disconnected the AI model", "Disconnected. The key was removed.")}>
              Disconnect
            </Btn>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ol className="m-0 list-decimal pl-5 text-[13px] text-muted">
            <li>Sign in at console.anthropic.com, add billing, and create an API key.</li>
            <li>Paste it here. It is checked, stored encrypted, and never shown again.</li>
            <li>Luqman then studies the ads every night at 02:10. Each study is one request to the model, billed to your Anthropic account.</li>
          </ol>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
              <label htmlFor="ai-key" className="text-[13px] font-semibold">
                Anthropic API key
              </label>
              <input id="ai-key" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} className={INPUT_CLS} />
            </div>
            <Btn disabled={busy || key.trim().length < 20} onClick={() => void call("save_key", { api_key: key }, "Saved the AI model key", "Key accepted and saved.")}>
              {busy ? "Checking…" : "Save and test"}
            </Btn>
          </div>
        </div>
      )}
      {msg && <div role="status" className={`rounded-lg px-3 py-2 text-[13px] font-semibold ${msg.ok ? "bg-[#E3F2E9] text-[#17663F]" : "bg-[#FBE6E3] text-[#A3231B]"}`}>{msg.text}</div>}
    </Card>
  );
}

/* ---------------- Data Health ---------------- */

function DataHealth() {
  const { data: t } = useMonthTotals();
  const month = useCampaigns(30);
  const [leads, setLeads] = useState<number | null>(null);
  useEffect(() => {
    if (!supabase) return;
    void supabase.from("leads").select("id", { count: "exact", head: true }).then(({ count }) => setLeads(count ?? 0));
  }, []);
  const running = month.data.filter((c) => c.delivery_status === "ACTIVE" || c.spend > 0);
  const untagged = running.filter((c) => !c.country);
  const noRunBy = running.filter((c) => !c.run_by);
  return (
    <>
      <div className="flex flex-wrap gap-4">
        <Stat label="Last sync with Meta" value={when(t?.last_good_sync)} sub={t?.last_sync?.ok === false ? `Latest attempt failed: ${t.last_sync.error}` : "Runs every hour"} />
        <Stat label="Campaigns not tagged" value={String(untagged.length)} sub={`of ${running.length} active or with spend in 30 days`} />
        <Stat label="No Run by" value={String(noRunBy.length)} sub="cannot be compared by staff" />
        <Stat label="Website form leads received" value={leads === null ? "…" : String(leads)} sub={leads ? "through the webhook" : "the website is not sending leads yet"} />
      </div>
      <Card title="Checks that need TravelCRM">
        <div className="text-sm">
          Lead gap between Meta and the website, and how many deposits match an ad lead by phone number, are shown here once the website form and
          TravelCRM are both connected.
        </div>
      </Card>
    </>
  );
}

/* ---------------- Users ---------------- */

function Users() {
  const { user, demo, access } = useAuth();
  const [people, setPeople] = useState<StaffRow[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [log, setLog] = useState<ActivityRow[]>([]);
  const [source, setSource] = useState<"supabase" | "browser">("browser");
  const [form, setForm] = useState({ name: "", email: "", role: "staff", password: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);

  async function refresh() {
    const a = await fetchActivity();
    setLog(a.rows);
    setSource(a.source);
    const r = await listStaff();
    if (r.ok && r.people) {
      setPeople(r.people);
      setIsAdmin(Boolean(r.is_admin));
      setLoadErr("");
    } else setLoadErr(r.error ?? "Could not load the staff list.");
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function run(key: string, job: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(key);
    setMsg(null);
    const r = await job();
    setBusy("");
    setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.error ?? "Something went wrong." });
    if (r.ok) await refresh();
    return r.ok;
  }

  async function add() {
    const password = form.password || makePassword();
    const ok = await run("add", () => addStaff({ ...form, password }), `${form.name} added. Give them the email and temporary password below; they choose their own at first sign-in.`);
    if (ok) {
      setShown({ email: form.email.trim().toLowerCase(), password });
      setForm({ name: "", email: "", role: "staff", password: "" });
    }
  }
  async function reset(p: StaffRow) {
    if (!window.confirm(`Set a new temporary password for ${p.name || p.email}? Their current password stops working.`)) return;
    const password = makePassword();
    const ok = await run(`pw-${p.id}`, () => resetStaffPassword(p.id, password), `New temporary password set for ${p.name || p.email}.`);
    if (ok) setShown({ email: p.email, password });
  }
  async function toggle(p: StaffRow) {
    if (p.active && !window.confirm(`Turn off access for ${p.name || p.email}? They are signed out and cannot sign in again until it is turned back on.`)) return;
    await run(`on-${p.id}`, () => updateStaff(p.id, { active: !p.active }), p.active ? `Access turned off for ${p.name || p.email}.` : `Access turned back on for ${p.name || p.email}.`);
  }
  async function role(p: StaffRow, r: string) {
    await run(`role-${p.id}`, () => updateStaff(p.id, { role: r }), `${p.name || p.email} is now ${r === "admin" ? "an admin" : "staff"}.`);
  }

  const when = (iso?: string | null) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–");
  const sel = "min-h-[36px] rounded-lg border border-[#9AA39E] bg-white px-2 text-[13px]";

  return (
    <>
      <Card>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
          <li>Only people on this list can sign in. There is no open sign-up.</li>
          <li><B>Admin</B>: everything staff can do, plus adding staff, turning access off and resetting passwords.</li>
          <li><B>Staff</B>: full use of the system: approvals, campaigns, rules and settings. Raising a budget needs an admin, or staff given <B>Can raise budgets</B> below.</li>
          <li>Every action is recorded under the person's name.</li>
        </ul>
      </Card>

      {isAdmin && (
        <Card title="Add a staff member" sub="They sign in with this email and the temporary password, then choose their own password.">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <Field id="st-name" label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field id="st-email" label="Work email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <div className="flex min-w-0 flex-col gap-1 sm:min-w-[140px] sm:gap-1.5">
              <label htmlFor="st-role" className="text-[12px] font-semibold sm:text-[13px]">Role</label>
              <select id="st-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Field id="st-pw" label="Temporary password" value={form.password} placeholder="Leave empty to make one" note="At least 10 characters, letters and numbers." onChange={(v) => setForm({ ...form, password: v })} />
            <Btn onClick={() => void add()} disabled={busy === "add" || !form.name.trim() || !form.email.trim()}>{busy === "add" ? "Adding…" : "Add staff"}</Btn>
          </div>
        </Card>
      )}

      {msg && (
        <div role={msg.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-[13px] font-semibold ${msg.ok ? "bg-[#E3F2EC] text-[#0B5A43]" : "bg-[#FBE6E3] text-[#A3231B]"}`}>
          {msg.text}
        </div>
      )}
      {shown && (
        <Card title="Give these to the staff member" right={<Btn kind="s" small onClick={() => setShown(null)}>Done, hide it</Btn>} sub="Shown once. Send it privately, for example by WhatsApp to that person only.">
          <div className="flex flex-col gap-1 text-sm">
            <div>Website: <B>{window.location.origin}</B></div>
            <div>Email: <B>{shown.email}</B></div>
            <div>Temporary password: <code className="rounded bg-[#ECEFEC] px-1.5 py-0.5 text-[15px] font-bold">{shown.password}</code></div>
          </div>
          <Btn kind="s" small className="self-start" onClick={() => void navigator.clipboard?.writeText(`MTB Marketing AI\n${window.location.origin}\nEmail: ${shown.email}\nTemporary password: ${shown.password}\nYou will choose your own password at first sign-in.`)}>
            Copy message
          </Btn>
        </Card>
      )}

      <Card
        title="Staff"
        right={<Pill tone="n">{people.filter((p) => p.active).length} active</Pill>}
        sub={demo ? "Demo mode: showing the current sign-in only." : isAdmin ? "Change a role, turn access off or on, or set a new temporary password." : "Only an admin can change this list."}
      >
        {loadErr ? (
          <div className="text-sm text-[#A3231B]">{loadErr}</div>
        ) : (
          <T
            minW={760}
            heads={["Name", "Email", "Role", "Raise budgets", "Status", "Last sign-in", ...(isAdmin ? [""] : [])]}
            rows={(people.length ? people : user ? [{ id: "me", email: user.email, name: user.name, role: access?.role ?? "staff", active: true, must_change_password: false, created_at: "", added_by_email: null, last_sign_in_at: null } as StaffRow] : []).map((p) => [
              <B>{p.name || "(no name)"}{p.email === user?.email ? " (you)" : ""}</B>,
              <span className="break-all">{p.email}</span>,
              isAdmin && p.email !== user?.email ? (
                <select aria-label={`Role for ${p.name || p.email}`} className={sel} value={p.role} disabled={busy === `role-${p.id}`} onChange={(e) => void role(p, e.target.value)}>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <Pill tone={p.role === "admin" ? "t" : "n"}>{p.role === "admin" ? "Admin" : "Staff"}</Pill>
              ),
              p.role === "admin" ? (
                <span className="text-[13px] text-muted">Yes (admin)</span>
              ) : isAdmin ? (
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" className="h-5 w-5" checked={Boolean(p.can_approve_budget)} disabled={busy === `rb-${p.id}`} onChange={(e) => void run(`rb-${p.id}`, () => updateStaff(p.id, { can_approve_budget: e.target.checked }), e.target.checked ? `${p.name || p.email} can now raise budgets.` : `${p.name || p.email} can no longer raise budgets.`)} />
                  Can raise budgets
                </label>
              ) : (
                <span className="text-[13px]">{p.can_approve_budget ? "Yes" : "No"}</span>
              ),
              !p.active ? <Pill tone="r">Turned off</Pill> : p.must_change_password ? <Pill tone="a">Waiting for first sign-in</Pill> : <Pill tone="g">Active</Pill>,
              when(p.last_sign_in_at),
              ...(isAdmin
                ? [
                    p.email === user?.email ? (
                      ""
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Btn kind="s" small disabled={busy === `pw-${p.id}` || !p.active} onClick={() => void reset(p)}>New password</Btn>
                        <Btn kind={p.active ? "x" : "p"} small disabled={busy === `on-${p.id}`} onClick={() => void toggle(p)}>{p.active ? "Turn off" : "Turn on"}</Btn>
                      </div>
                    ),
                  ]
                : []),
            ])}
          />
        )}
      </Card>

      <Card
        title="Activity log"
        right={
          <div className="flex items-center gap-3">
            <Pill tone={source === "supabase" ? "g" : "a"}>{source === "supabase" ? "Live from the database" : "Kept in this browser"}</Pill>
            <Btn kind="s" onClick={() => void refresh()}>
              Refresh
            </Btn>
          </div>
        }
        sub="Actions by people. Entries can be added and read, never edited or deleted. Actions by AI staff are in AI Office."
      >
        {log.length === 0 ? (
          <div className="text-sm text-muted">No actions recorded yet. Approve an item, pause a campaign or save the rules, then press Refresh.</div>
        ) : (
          <T minW={720} heads={["When", "Who", "What they did", "Where"]} rows={log.map((l) => [when(l.created_at), <B>{l.user_name || l.user_email}</B>, l.action, l.area])} />
        )}
      </Card>
    </>
  );
}
