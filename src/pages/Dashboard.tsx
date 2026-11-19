import { Link } from "react-router-dom";
import { AGENT_STATE, Avatar, B, Bar, Card, CostStatus, PageHead, Pill, SampleTag, Seat, Stat, T, Typing } from "../components/ui";
import { ATTENTION, DEPARTURES_NEAR, NOTIFICATIONS, STAFF, TODAY_LABEL, TOTALS } from "../lib/data";
import { useStore } from "../lib/store";

const linkBtn = "flex min-h-[44px] items-center rounded-lg border border-[#9AA39E] px-3.5 text-sm font-semibold text-ink no-underline";

export default function Dashboard() {
  const { approvals, untagged } = useStore();

  return (
    <>
      <PageHead title="Dashboard" sub={TODAY_LABEL} right={<SampleTag />} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand px-5 py-4 text-white">
        <div>
          <div className="text-xl font-bold">
            {approvals.length === 0 ? "Nothing is waiting for approval" : `${approvals.length} item${approvals.length === 1 ? "" : "s"} awaiting approval`}
          </div>
          <div className="text-sm text-[#D6EBE4]">From Campaign Planner and Ads Manager.</div>
        </div>
        <Link to="/approvals" className="flex min-h-[44px] items-center justify-center rounded-lg bg-white px-5 text-sm font-bold text-brand no-underline">
          Review now
        </Link>
      </div>

      <Card title="Notifications" right={<Pill tone="a">{NOTIFICATIONS.length} new</Pill>}>
        {NOTIFICATIONS.map((n, i) => (
          <div key={i} className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-bold">{i === 0 ? `${untagged.length} campaign${untagged.length === 1 ? " is" : "s are"} running in Meta but not in the system.` : n.bold}</span>
              {n.rest}
            </div>
            <Link to={n.to} className={linkBtn}>
              {n.cta}
            </Link>
          </div>
        ))}
      </Card>

      <div className="flex flex-wrap gap-4">
        <Stat label="Spend this month" value={TOTALS.spendMonth} sub={`of ${TOTALS.budget}`} />
        <Stat label="Deposit pax from ads" value={TOTALS.pax} sub="leads 13 Oct to 12 Nov" />
        <Stat label="Cost per pax" value={TOTALS.cpp} sub="leads past the 7-day close window" extra={<div><CostStatus st="a" /></div>} />
        <Stat label="Leads this month" value={TOTALS.leadsMonth} sub={`CPL ${TOTALS.cpl}`} />
      </div>

      <div className="flex flex-wrap gap-4">
        <Card className="min-w-0 flex-[1_1_420px]" title="AI staff" right={<Link to="/ai-office" className="text-[13px] font-semibold">Open AI Office</Link>}>
          <div className="flex flex-col gap-4">
            {STAFF.map((s) => (
              <div key={s.who} className="flex items-center gap-3">
                <Avatar who={s.who} state={s.state} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{s.name}</div>
                  <div className="text-[13px] text-muted">
                    {s.now}
                    {s.state === "work" && <Typing />}
                  </div>
                </div>
                <Pill tone={AGENT_STATE[s.state].tone}>{AGENT_STATE[s.state].label}</Pill>
              </div>
            ))}
          </div>
        </Card>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <Card title="Monthly budget" right={<div className="text-[13px] text-muted">Day 19 of 30</div>}>
            <Bar pct={TOTALS.budgetPct} label={`${TOTALS.budgetPct} percent of budget used`} />
            <div className="text-sm">
              {TOTALS.budgetPct}% used, {TOTALS.monthPct}% of the month gone
            </div>
          </Card>
          <Card title="Needs attention">
            <div className="flex flex-col gap-3">
              {ATTENTION.map((a) => (
                <div key={a.name} className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{a.name}</div>
                  <Pill tone={a.tone}>{a.note}</Pill>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Departures close to D-50" right={<div className="text-[13px] text-muted">KPI: full before D-50</div>}>
        <T
          heads={["Departure", "Days", "Seats", "D-50 KPI", "Open seats"]}
          rows={DEPARTURES_NEAR.map((d) => [<B>{d.name}</B>, d.days, <Seat n={d.filled} />, <Pill tone={d.tone}>{d.kpi}</Pill>, d.open])}
        />
      </Card>
    </>
  );
}
