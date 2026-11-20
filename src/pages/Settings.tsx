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

  return (
    <>
      <Card>
        <div className="text-[15px] font-bold">
          {working} of {rows.length + 1} connections are working
        </div>
        <div className="text-[13px] text-muted">
          This is the real status, not sample data. If a required connection fails, Auto mode stops and returns to Approval.
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Supabase" right={db.ok ? <Pill tone="g">Connected</Pill> : <Pill tone="r">Not connected</Pill>}>
          <div className="text-sm">Database, sign-in and activity log.</div>
          <div className="text-[13px] text-muted">{db.detail}</div>
          <div className="mt-auto flex justify-end">
            <Btn kind="s" onClick={() => void load(true)} disabled={!supabase}>
              Test connection
            </Btn>
          </div>
        </Card>
        {rows.map((r) =>
          r.key === "meta_ads" ? (
            <MetaAdsCard key={r.key} row={r} reload={() => load(false)} />
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
          ),
        )}
      </div>
    </>
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
  const input = "min-h-[44px] w-full rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";

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
            <label key={a.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-line px-3">
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
      <p className="m-0 text-[13px] text-muted">Read only for now: the system cannot change anything in Meta until Phase 2.</p>
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
const INPUT_CLS = "min-h-[44px] w-full rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";

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
  const [people, setPeople] = useState<{ email: string; name: string | null; created_at: string; is_superadmin?: boolean }[]>([]);
  const [log, setLog] = useState<ActivityRow[]>([]);
  const [source, setSource] = useState<"supabase" | "browser">("browser");

  async function refresh() {
    const a = await fetchActivity();
    setLog(a.rows);
    setSource(a.source);
    if (supabase) {
      const { data } = await supabase.from("profiles").select("email, name, created_at, is_superadmin").order("created_at");
      if (data) setPeople(data);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  const when = (iso: string) => new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const list: typeof people = people.length ? people : user ? [{ email: user.email, name: user.name, created_at: new Date().toISOString() }] : [];

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
          rows={list.map((p) => [<B>{p.name || "(no name)"}</B>, <span className="break-all">{p.email}</span>, p.is_superadmin ? <Pill tone="t">Superadmin</Pill> : <Pill tone="g">Full access</Pill>, when(p.created_at)])}
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
