import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, B, Card, PageHead, Pill, T } from "../components/ui";
import { STAFF } from "../lib/data";
import { type DashPeriod, type Report, count, cpl, delivery, fetchLatestReport, paxLabel, paxTone, pendingCount, perPax, rm, rm2, spanText, useCampaigns, useCountryCost, useDashTotals, useMonthTotals, when } from "../lib/live";
import { supabase } from "../lib/supabase";

const linkBtn = "flex min-h-[36px] sm:min-h-[44px] items-center rounded-lg border border-[#9AA39E] px-3.5 text-sm font-semibold text-ink no-underline";
const cardLink = "text-[13px] font-semibold";

type Key = "today" | "yesterday" | "week" | "month";
const PERIODS: { key: Key; label: string; before: string }[] = [
  { key: "today", label: "Today", before: "" },
  { key: "yesterday", label: "Yesterday", before: "the day before" },
  { key: "week", label: "Last 7 days", before: "the 7 days before" },
  { key: "month", label: "This month", before: "last month to the same date" },
];

const pct = (n: number) => `${Math.abs(n) >= 10 ? Math.round(n) : n.toFixed(1)}%`;
const change = (now: number | null, prev: number | null) => (now === null || prev === null || prev <= 0 ? null : ((now - prev) / prev) * 100);

/** Up or down against the period before. `good` says which direction is good news; "none" stays grey. */
function Delta({ value, good, versus }: { value: number | null; good: "up" | "down" | "none"; versus: string }) {
  if (value === null || !versus) return null;
  const flat = Math.abs(value) < 0.5;
  const isGood = good !== "none" && !flat && (value > 0 ? good === "up" : good === "down");
  const isBad = good !== "none" && !flat && !isGood;
  const tone = isGood ? "bg-[#E3F2E9] text-[#17663F]" : isBad ? "bg-[#FBE6E3] text-[#A3231B]" : "bg-[#ECEFEC] text-[#3F4A45]";
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-muted">
      <span className={`rounded-full px-2 py-0.5 font-semibold ${tone}`}>
        {flat ? "No change" : `${value > 0 ? "▲" : "▼"} ${pct(Math.abs(value))}`}
      </span>
      <span>vs {versus}</span>
    </div>
  );
}

function Tile({ label, value, sub, children, accent = false }: { label: string; value: ReactNode; sub?: ReactNode; children?: ReactNode; accent?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-xl border p-3 sm:gap-1.5 sm:p-5 ${accent ? "border-brand bg-[#F1F8F5]" : "border-line bg-white"}`}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted sm:text-[12px]">{label}</div>
      <div className="text-[20px] font-bold leading-none sm:text-[30px]">{value}</div>
      {sub && <div className="text-[12px] leading-snug text-muted sm:text-[13px]">{sub}</div>}
      {children}
    </div>
  );
}

function Meter({ value, mark, tone }: { value: number; mark?: number; tone: "g" | "a" | "r" }) {
  const color = { g: "bg-[#2E8B62]", a: "bg-[#D08A00]", r: "bg-[#C2382E]" }[tone];
  return (
    <div className="relative h-2 w-full rounded-full bg-[#E9EDEA]" aria-hidden="true">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      {mark !== undefined && <div className="absolute -top-1 h-4 w-0.5 bg-ink" style={{ left: `${Math.min(100, mark)}%` }} />}
    </div>
  );
}

export default function Dashboard() {
  const { data: t, error } = useMonthTotals();
  const { data: dash } = useDashTotals();
  const week = useCampaigns(7);
  const cost = useCountryCost(30);
  const [key, setKey] = useState<Key>("week");
  const [report, setReport] = useState<Report | null>(null);
  const [whole, setWhole] = useState(false);
  const [pending, setPending] = useState(0);
  const [aiOn, setAiOn] = useState(false);
  useEffect(() => {
    void fetchLatestReport().then(setReport);
    void pendingCount().then(setPending);
    if (supabase) void supabase.from("integration_status").select("secret_hint").eq("key", "ai_model").maybeSingle().then(({ data }) => setAiOn(Boolean(data?.secret_hint)));
  }, []);

  const running = week.data.filter((c) => c.delivery_status === "ACTIVE" || c.spend > 0);
  const untagged = running.filter((c) => !c.country);
  const top = week.data.filter((c) => c.spend > 0).slice(0, 8);
  const weekSpend = week.data.reduce((n, c) => n + c.spend, 0);
  const today = new Date().toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long" });
  const failed = t?.last_sync && t.last_sync.ok === false;

  const period = PERIODS.find((p) => p.key === key)!;
  const d: DashPeriod | null = dash?.periods[key] ?? null;
  const target = dash?.target ?? 50;
  const limit = dash?.limit ?? 80;
  const cpp = d && d.pax > 0 && d.spend > 0 ? d.spend / d.pax : null;
  const prevCpp = d && d.prev.pax && d.prev.spend && d.prev.pax > 0 ? d.prev.spend / d.prev.pax : null;
  const versus = key === "today" ? "" : period.before;
  const rate = d && d.leads > 0 ? (d.pax / d.leads) * 100 : null;
  const prevRate = d && d.prev.leads && d.prev.pax !== null && d.prev.leads > 0 ? (d.prev.pax / d.prev.leads) * 100 : null;
  const budget = dash?.monthly_budget ?? null;
  const month = dash?.periods.month ?? null;
  const used = budget && month ? (month.spend / budget) * 100 : null;
  const elapsed = dash ? (dash.day_of_month / dash.days_in_month) * 100 : null;

  const countries = (cost.data?.rows ?? []).filter((r) => r.spend > 0 && r.country !== "Not tagged").slice(0, 8);
  const countrySpend = (cost.data?.rows ?? []).reduce((n, r) => n + r.spend, 0);

  return (
    <>
      <PageHead title="Dashboard" sub={`${today}. Meta figures as of ${when(t?.last_good_sync)}.`} />

      {error && <div className="rounded-xl bg-[#FBE6E3] px-3.5 py-3 sm:px-5 sm:py-4 text-sm text-[#A3231B]">Could not load the figures: {error}</div>}
      {failed && (
        <div className="rounded-xl bg-[#FBE6E3] px-3.5 py-3 sm:px-5 sm:py-4 text-sm text-[#A3231B]">
          <B>The last sync with Meta failed.</B> {t?.last_sync?.error} Figures below are from the last good sync.
        </div>
      )}
      {untagged.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand px-3.5 py-3 text-white sm:px-5 sm:py-4">
          <div>
            <div className="text-lg font-bold">
              {untagged.length} running campaign{untagged.length === 1 ? "" : "s"} not tagged
            </div>
            <div className="text-sm text-[#D6EBE4]">Tag the destination and who ran it, so spend is counted in the right place.</div>
          </div>
          <Link to="/campaigns" className="flex min-h-[36px] sm:min-h-[44px] items-center justify-center rounded-lg bg-white px-5 text-sm font-bold text-brand no-underline">
            Tag now
          </Link>
        </div>
      )}

      {/* Headline: one period switch drives all four figures. */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-lg font-bold">Results</h2>
          <div role="tablist" aria-label="Period" className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-white p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                role="tab"
                aria-selected={key === p.key}
                onClick={() => setKey(p.key)}
                className={`min-h-[36px] whitespace-nowrap rounded-md px-3 text-[13px] font-semibold ${key === p.key ? "bg-brand text-white" : "bg-transparent text-ink"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <Tile accent label="Paid deposit" value={d ? `${count(d.pax)} pax` : "…"} sub={d ? `${count(d.bookings)} ${d.bookings === 1 ? "booking" : "bookings"}` : ""}>
            <Delta value={d ? change(d.pax, d.prev.pax) : null} good="up" versus={versus} />
          </Tile>
          <Tile
            label="Cost per pax deposit"
            value={cpp === null ? "–" : rm2(cpp)}
            sub={
              cpp === null ? (
                d && d.pax === 0 ? "No deposit in this period yet" : ""
              ) : (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <Pill tone={paxTone(cpp)}>{paxLabel(cpp)}</Pill>
                  <span>{cpp > limit ? `${pct(((cpp - limit) / limit) * 100)} over the RM${limit} limit` : cpp > target ? `${pct(((cpp - target) / target) * 100)} over the RM${target} target` : `${pct(((target - cpp) / target) * 100)} under the RM${target} target`}</span>
                </span>
              )
            }
          >
            <Delta value={change(cpp, prevCpp)} good="down" versus={versus} />
          </Tile>
          <Tile label="Ad spend" value={d ? rm(d.spend) : "…"} sub={d && d.leads > 0 ? `${count(d.leads)} leads at ${rm2(d.spend / d.leads)} each` : d ? "No leads yet" : ""}>
            <Delta value={d ? change(d.spend, d.prev.spend) : null} good="none" versus={versus} />
          </Tile>
          <Tile label="Leads to deposit" value={rate === null ? "–" : pct(rate)} sub={d && d.leads > 0 ? `${count(d.pax)} pax from ${count(d.leads)} leads` : ""}>
            <Delta value={change(rate, prevRate)} good="up" versus={versus} />
          </Tile>
        </div>

        {used !== null && elapsed !== null && budget !== null && month && (
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-white px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
              <span>
                <B>Budget this month:</B> {rm(month.spend)} of {rm(budget)} used ({pct(used)})
              </span>
              <span className="text-[13px] text-muted">
                {pct(elapsed)} of the month gone. {used > elapsed + 5 ? "Spending faster than the month." : used < elapsed - 5 ? "Spending slower than the month." : "On pace."}
              </span>
            </div>
            <Meter value={used} mark={elapsed} tone={used > elapsed + 5 ? "a" : "g"} />
          </div>
        )}

        <div className="text-[12px] leading-relaxed text-muted">
          Paid deposit is bookings with status paid deposit in TravelCRM, by booking date{dash?.deposits_loaded ? `, last loaded ${when(dash.deposits_loaded)}` : ""}. It is
          loaded once a night, so today fills in tomorrow. Cost per pax here is all ad spend divided by all paid-deposit pax.
          {dash?.deposits_from ? ` Deposit records start ${spanText({ from: dash.deposits_from, to: dash.deposits_from })}.` : ""}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card
          className="lg:col-span-3"
          title="Luqman's night report"
          right={report ? <span className="text-[13px] text-muted">{when(report.created_at)}</span> : undefined}
        >
          {report ? (
            <>
              <div className={`text-sm leading-snug sm:text-[15px] sm:leading-relaxed ${whole ? "" : "line-clamp-4 sm:line-clamp-none"}`}>{report.summary}</div>
              {report.summary.length > 220 && (
                <button type="button" onClick={() => setWhole(!whole)} className="self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-brand underline sm:hidden">
                  {whole ? "Show less" : "Read all"}
                </button>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <Link to="/approvals" className={linkBtn}>
                  {pending > 0 ? `Review ${pending} proposal${pending === 1 ? "" : "s"}` : "Open Approvals"}
                </Link>
                <Link to="/analysis" className={linkBtn}>
                  See his recommendations
                </Link>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted">{aiOn ? "No report yet. Luqman studies the ads every night at 02:10." : "Connect the AI model in Settings, Integrations to get a nightly report."}</div>
          )}
        </Card>

        <Card className="lg:col-span-2" title="AI staff" right={<Link to="/ai-office" className={cardLink}>Open AI Office</Link>}>
          <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
            {STAFF.map((s) => {
              const on = s.who === "sch" ? false : s.who === "data" || s.who === "ads" || s.who === "plan" || aiOn || (s.who === "ana" && Boolean(report));
              const note = s.who === "data" ? `Last sync ${when(t?.last_good_sync)}` : s.who === "ana" && report ? `Last study ${when(report.created_at)}` : s.who === "ana" && aiOn ? "First study at 02:10 tonight" : s.who === "bud" && aiOn ? "Plans the budget every morning at 06:30" : s.who === "cre" && aiOn ? "Reviews creatives Monday and Thursday" : s.starts;
              return (
                <li key={s.who} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                  <Avatar who={s.who} state={on ? "work" : "idle"} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">
                      {s.name} <span className="font-normal text-muted">· {s.role}</span>
                    </div>
                    <div className="truncate text-[13px] text-muted">{note}</div>
                  </div>
                  <Pill tone={on ? "g" : "n"}>{s.who === "sch" ? "By schedule" : s.who === "ads" || s.who === "plan" ? "On call" : on ? "Running" : "Not started"}</Pill>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card title="Cost per pax deposit by country" sub="Last 30 days. Target RM50, limit RM80." right={<Link to="/analysis" className={cardLink}>Open Analysis</Link>} className="!gap-2">
        {countries.length === 0 ? (
          <div className="text-sm">Nothing to show until campaigns are tagged. Open Campaigns and apply the suggestions.</div>
        ) : (
          <T
            minW={620}
            right={[1, 2, 3, 4]}
            heads={["Country", "Spend", "Share of spend", "Deposit pax", "Cost per pax", ""]}
            rows={countries.map((r) => [
              <B>{r.country}</B>,
              rm(r.spend),
              countrySpend > 0 ? pct((r.spend / countrySpend) * 100) : "",
              count(r.pax_direct),
              perPax(r) === null ? "–" : rm2(perPax(r)!),
              <Pill tone={paxTone(perPax(r))}>{paxLabel(perPax(r))}</Pill>,
            ])}
          />
        )}
        <div className="text-[12px] text-muted">An estimate. Pax here leaves out bookings that look like agent or staff entries, so it is lower than the headline above.</div>
      </Card>

      <Card title="Top spend" sub="Last 7 days." right={<Link to="/campaigns" className={cardLink}>Open Campaigns</Link>} className="!gap-2">
        {!week.loading && top.length === 0 ? (
          <div className="text-sm text-muted">No spend in the last 7 days.</div>
        ) : (
          <T
            minW={760}
            right={[3, 4, 5, 6]}
            heads={["Campaign", "Country", "Delivery", "Spend", "Share", "Leads (Meta)", "CPL"]}
            rows={top.map((c) => [
              <B>{c.name}</B>,
              c.country ? <Pill tone="t">{c.country}</Pill> : <Pill tone="a">Not tagged</Pill>,
              <Pill tone={delivery(c.delivery_status).tone}>{delivery(c.delivery_status).text}</Pill>,
              rm(c.spend),
              weekSpend > 0 ? pct((c.spend / weekSpend) * 100) : "",
              count(c.leads),
              cpl(c.spend, c.leads),
            ])}
          />
        )}
      </Card>
    </>
  );
}
