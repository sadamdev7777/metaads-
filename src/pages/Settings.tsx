import { useEffect, useState } from "react";
import { NavLink, Navigate, useParams } from "react-router-dom";
import { Avatar, B, Bar, Btn, Card, Field, PageHead, Pill, SampleTag, Stat, T } from "../components/ui";
import { fetchActivity, type ActivityRow } from "../lib/activity";
import { useAuth } from "../lib/auth";
import { BUDGET, LEAD_GAP, MODE_ROWS } from "../lib/data";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";

const TABS = [
  { key: "rules", label: "Rules", sub: "AI staff follow these as soon as they are saved." },
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
      <nav aria-label="Settings sections" className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <NavLink
            key={t.key}
            to={`/settings/${t.key}`}
            className={({ isActive }) =>
              `flex min-h-[44px] items-center border-b-[3px] px-4 text-sm no-underline ${isActive ? "border-brand font-bold text-brand" : "border-transparent font-medium text-muted"}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      {tab === "rules" && <Rules />}
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
        <div className="flex flex-wrap gap-4">
          <Field id="r1" label="Target cost per pax (RM)" value={r.target_cost_per_pax} onChange={set("target_cost_per_pax")} note="Below this, budget is raised" />
          <Field id="r2" label="Cost per pax limit (RM)" value={r.limit_cost_per_pax} onChange={set("limit_cost_per_pax")} note="Above this, the ad is turned off" />
          <Field id="r3" label="Monthly budget (RM)" value={r.monthly_budget} onChange={set("monthly_budget")} />
        </div>
        <div className="flex flex-wrap gap-4">
          <Field id="r4" label="Close window (days)" value={r.close_window_days} onChange={set("close_window_days")} note="Starting assumption for all products" />
          <Field id="r5" label="Full payment (days before departure)" value={r.full_payment_days} onChange={set("full_payment_days")} note="KPI: departure full before this" />
          <Field id="r6" label="Minimum pax before an ad set is judged" value={r.min_pax_to_judge} onChange={set("min_pax_to_judge")} note="Suggested value, to confirm" />
        </div>
      </Card>

      <Card title="Action modes" sub="Each action type has its own switch. All start on Approval. Auto does nothing until Phase 4.">
        <T
          minW={760}
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
                    className={`min-h-[44px] px-3.5 text-[13px] font-semibold ${modes[k] === v ? "bg-brand text-white" : "bg-white text-ink"}`}
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
        <div className="flex flex-wrap gap-4">
          <Field id="s1" label="Maximum budget increase per day (%)" value={r.max_budget_increase_pct} onChange={set("max_budget_increase_pct")} note={todo} />
          <Field id="s2" label="Starting budget for a new campaign (RM)" value={r.new_campaign_start_budget} onChange={set("new_campaign_start_budget")} note={todo} />
          <Field id="s3" label="Overall daily spend limit (RM)" value={r.daily_spend_limit} onChange={set("daily_spend_limit")} note={todo} />
        </div>
        <div className="flex flex-wrap gap-4">
          <Field id="s4" label="Maximum actions per day" value={r.max_actions_per_day} onChange={set("max_actions_per_day")} note={todo} />
          <Field id="s5" label="Lead gap that triggers an alert (%)" value={r.lead_gap_alert_pct} onChange={set("lead_gap_alert_pct")} note={todo} />
          <div className="hidden min-w-[200px] flex-1 md:block" />
        </div>
      </Card>
    </>
  );
}

/* ---------------- Budget ---------------- */

function Budget() {
  return (
    <>
      <div className="flex justify-end">
        <SampleTag />
      </div>
      <div className="flex flex-wrap gap-4">
        <Stat label="Budget this month" value="RM100,000" sub="November" />
        <Stat label="Spent so far" value="RM61,200" sub="day 19 of 30" />
        <Stat label="Projected month end" value="RM96,600" sub="at the current daily rate" />
      </div>
      <Card
        title="Monthly budget by country"
        sub="Set how much each country may spend this month. Campaign Planner keeps new campaign budgets inside the plan, and Analyst warns when a country is heading over."
      >
        <T
          minW={760}
          right={[1, 2, 4]}
          heads={["Country", "Planned", "Spent so far", "Of plan", "Projected month end", "Status"]}
          rows={[
            ...BUDGET.map((b) => [
              <B>{b.country}</B>,
              b.planned,
              b.spent,
              <div className="flex items-center gap-2">
                <div className="w-28">
                  <Bar pct={b.pct} label={`${b.pct} percent of plan spent`} />
                </div>
                {b.pct}%
              </div>,
              b.projected,
              <Pill tone={b.tone}>{b.status}</Pill>,
            ]),
            [<B>Total</B>, <B>RM100,000</B>, <B>RM61,200</B>, "61%", <B>RM96,600</B>, <Pill tone="g">On plan</Pill>],
          ]}
        />
      </Card>
    </>
  );
}

/* ---------------- Integrations ---------------- */

type Integ = { key: string; name: string; used_for: string; status: "connected" | "check" | "not_set_up"; detail: string };
const FALLBACK: Integ[] = [
  { key: "travelcrm", name: "TravelCRM", used_for: "Products, dates, seats and deposits.", status: "not_set_up", detail: "Waiting for the TravelCRM MCP to be installed. Phase 1." },
  { key: "meta_ads", name: "Meta Ads", used_for: "Campaigns, spend, and launching or changing ads.", status: "not_set_up", detail: "Not connected to this system yet. Phase 1 reads, Phase 2 writes." },
  { key: "website_form", name: "MTB website form", used_for: "Leads with the product picked and the campaign UTM.", status: "not_set_up", detail: "How the system reads form data is not confirmed yet. Phase 1." },
  { key: "whatsapp", name: "WhatsApp", used_for: "Daily report and approval messages.", status: "not_set_up", detail: "Sending channel not chosen yet. Phase 4." },
  { key: "meta_capi", name: "Meta Conversions API", used_for: "Sends deposits back to Meta so it learns who pays.", status: "not_set_up", detail: "Phase 4." },
  { key: "mailgun", name: "Mailgun", used_for: "Email to leads that did not close.", status: "not_set_up", detail: "Planned for later, replaces Brevo." },
];

function Integrations() {
  const { act } = useStore();
  const [rows, setRows] = useState<Integ[]>(FALLBACK);
  const [db, setDb] = useState<{ ok: boolean; detail: string }>({ ok: false, detail: supabase ? "Checking…" : "Environment variables are not set in this build." });

  async function testDb(log: boolean) {
    if (!supabase) return;
    const started = performance.now();
    const { data, error } = await supabase.from("integration_status").select("key, name, used_for, status, detail").order("name");
    const ms = Math.round(performance.now() - started);
    if (error) setDb({ ok: false, detail: `Query failed: ${error.message}` });
    else {
      setDb({ ok: true, detail: `Database answered in ${ms} ms. Sign-in and activity log are live.` });
      if (data && data.length) setRows(data as Integ[]);
    }
    if (log) act("Tested the Supabase connection", "Settings, Integrations", error ? "Supabase test failed." : "Supabase is connected.");
  }

  useEffect(() => {
    void testDb(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const working = rows.filter((r) => r.status === "connected").length + (db.ok ? 1 : 0);
  const pill = (s: Integ["status"]) => (s === "connected" ? <Pill tone="g">Connected</Pill> : s === "check" ? <Pill tone="a">Check</Pill> : <Pill>Not set up</Pill>);

  return (
    <>
      <Card>
        <div className="text-[15px] font-bold">
          {working} of {rows.length + 1} connections are working
        </div>
        <div className="text-[13px] text-muted">
          This is the real status, not sample data. The other connections are set up in later phases. If a required connection fails, Auto mode stops
          and returns to Approval.
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Supabase" right={db.ok ? <Pill tone="g">Connected</Pill> : <Pill tone="r">Not connected</Pill>}>
          <div className="text-sm">Database, sign-in and activity log.</div>
          <div className="text-[13px] text-muted">{db.detail}</div>
          <div className="mt-auto flex justify-end">
            <Btn kind="s" onClick={() => void testDb(true)} disabled={!supabase}>
              Test connection
            </Btn>
          </div>
        </Card>
        {rows.map((r) => (
          <Card key={r.key} title={r.name} right={pill(r.status)}>
            <div className="text-sm">{r.used_for}</div>
            <div className="text-[13px] text-muted">{r.detail}</div>
            <div className="mt-auto flex justify-end">
              <Btn kind="s" onClick={() => act(`Opened setup for ${r.name}`, "Settings, Integrations", `${r.name} is set up in a later phase.`)}>
                {r.status === "not_set_up" ? "Set up" : "Test connection"}
              </Btn>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

/* ---------------- Data Health ---------------- */

function DataHealth() {
  const { untagged } = useStore();
  return (
    <>
      <div className="flex justify-end">
        <SampleTag />
      </div>
      <div className="flex flex-wrap gap-4">
        <Stat label="Lead gap, Meta vs website" value="3.9%" sub="Meta 9,720, website 9,340" />
        <Stat label="Deposits matched to an ad lead" value="85%" sub="812 of 955 pax in TravelCRM, by phone number" />
        <Stat label="Not matched" value="143 pax" sub="Other channels, or a different phone number. Not counted in cost per pax." />
        <Stat label="Campaigns not tagged" value={String(untagged.length)} sub="Spend not counted in any product" />
      </div>
      <Card title="Lead gap by country">
        <T
          right={[1, 2, 3, 4]}
          heads={["Country", "Meta leads", "Website leads", "Difference", "Gap", "Status"]}
          rows={LEAD_GAP.map((g) => [<B>{g.country}</B>, g.meta, g.web, g.diff, g.gap, g.ok ? <Pill tone="g">Within limit</Pill> : <Pill tone="a">Check</Pill>])}
        />
      </Card>
    </>
  );
}

/* ---------------- Users ---------------- */

function Users() {
  const { act } = useStore();
  const { user, demo } = useAuth();
  const [people, setPeople] = useState<{ email: string; name: string | null; created_at: string }[]>([]);
  const [log, setLog] = useState<ActivityRow[]>([]);
  const [source, setSource] = useState<"supabase" | "browser">("browser");

  async function refresh() {
    const a = await fetchActivity();
    setLog(a.rows);
    setSource(a.source);
    if (supabase) {
      const { data } = await supabase.from("profiles").select("email, name, created_at").order("created_at");
      if (data) setPeople(data);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  const when = (iso: string) => new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const list = people.length ? people : user ? [{ email: user.email, name: user.name, created_at: new Date().toISOString() }] : [];

  return (
    <>
      <Card>
        <div className="text-sm">
          Everyone has full access and there are no restrictions by role. The system keeps a record of who did what, taken from the sign-in. Run by on
          each campaign also comes from the sign-in.
        </div>
      </Card>

      <Card
        title="Users"
        right={
          <Btn onClick={() => act("Pressed Invite user", "Settings, Users", "For now, add users in the Supabase dashboard under Authentication. Inviting from here arrives with Phase 1.")}>
            Invite user
          </Btn>
        }
        sub={demo ? "Demo mode: showing the current sign-in only." : "Accounts are created in Supabase Authentication. There is no open sign-up."}
      >
        <T
          heads={["Name", "Email", "Access", "Added"]}
          rows={list.map((p) => [<B>{p.name || "(no name)"}</B>, <span className="break-all">{p.email}</span>, <Pill tone="g">Full access</Pill>, when(p.created_at)])}
        />
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
