import { Link } from "react-router-dom";
import { Avatar, B, Card, PageHead, Pill, Stat, T } from "../components/ui";
import { STAFF } from "../lib/data";
import { supabase } from "../lib/supabase";
import { useEffect, useState } from "react";
import { type Report, count, cpl, delivery, fetchLatestReport, paxLabel, paxTone, pendingCount, perPax, rm, rm2, useCampaigns, useCountryCost, useDepositTotals, useMonthTotals, when } from "../lib/live";

const linkBtn = "flex min-h-[44px] items-center rounded-lg border border-[#9AA39E] px-3.5 text-sm font-semibold text-ink no-underline";

export default function Dashboard() {
  const { data: t, error } = useMonthTotals();
  const { data: dep } = useDepositTotals();
  const week = useCampaigns(7);
  const cost = useCountryCost(30);
  const running = week.data.filter((c) => c.delivery_status === "ACTIVE" || c.spend > 0);
  const untagged = running.filter((c) => !c.country);
  const top = week.data.filter((c) => c.spend > 0).slice(0, 8);
  const today = new Date().toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "short" });
  const failed = t?.last_sync && t.last_sync.ok === false;
  const [report, setReport] = useState<Report | null>(null);
  const [pending, setPending] = useState(0);
  const [aiOn, setAiOn] = useState(false);
  useEffect(() => {
    void fetchLatestReport().then(setReport);
    void pendingCount().then(setPending);
    if (supabase) void supabase.from("integration_status").select("status, secret_hint, detail").eq("key", "ai_model").maybeSingle().then(({ data }) => setAiOn(Boolean(data?.secret_hint)));
  }, []);

  return (
    <>
      <PageHead title="Dashboard" sub={`${today}. Meta data as of ${when(t?.last_good_sync)}.`} />

      {error && <div className="rounded-xl bg-[#FBE6E3] px-5 py-4 text-sm text-[#A3231B]">Could not load the figures: {error}</div>}
      {failed && (
        <div className="rounded-xl bg-[#FBE6E3] px-5 py-4 text-sm text-[#A3231B]">
          <B>The last sync with Meta failed.</B> {t?.last_sync?.error} Figures below are from the last good sync.
        </div>
      )}

      {untagged.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand px-5 py-4 text-white">
          <div>
            <div className="text-xl font-bold">
              {untagged.length} running campaign{untagged.length === 1 ? "" : "s"} not tagged
            </div>
            <div className="text-sm text-[#D6EBE4]">Tag the country and who ran it, so spend is counted in the right place.</div>
          </div>
          <Link to="/campaigns" className="flex min-h-[44px] items-center justify-center rounded-lg bg-white px-5 text-sm font-bold text-brand no-underline">
            Tag now
          </Link>
        </div>
      )}

      {report && (
        <Card
          title="Luqman's night report"
          right={<div className="text-[13px] text-muted">{when(report.created_at)}</div>}
        >
          <div className="text-[15px] leading-relaxed">{report.summary}</div>
          <div className="flex flex-wrap gap-2">
            <Link to="/approvals" className={linkBtn}>
              {pending > 0 ? `Review ${pending} proposal${pending === 1 ? "" : "s"}` : "Open Approvals"}
            </Link>
            <Link to="/ai-office" className={linkBtn}>
              Read the full report
            </Link>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-4">
        <Stat label="Spend this month" value={t ? rm(t.spend) : "…"} sub="from Meta" />
        <Stat label="Leads this month" value={t ? count(t.leads) : "…"} sub="as counted by Meta" />
        <Stat label="Cost per lead" value={t && t.leads > 0 ? rm2(t.spend / t.leads) : "…"} sub="this month" />
        <Stat label="Active campaigns" value={t ? count(t.active) : "…"} sub={t ? `of ${count(t.campaigns)} in the ad account` : ""} />
      </div>

      <Card
        title="Paid deposit"
        right={<span className="text-[13px] text-muted">{dep?.last_synced ? `From TravelCRM, loaded ${when(dep.last_synced)}` : "From TravelCRM"}</span>}
      >
        <div className="flex flex-wrap gap-4">
          {(
            [
              ["Today", dep?.today],
              ["Yesterday", dep?.yesterday],
              ["Last 7 days", dep?.week],
              ["This month", dep?.month],
            ] as const
          ).map(([label, d]) => (
            <Stat key={label} label={label} value={d ? `${count(d.pax)} pax` : "…"} sub={d ? `${count(d.bookings)} ${d.bookings === 1 ? "booking" : "bookings"}` : ""} />
          ))}
        </div>
        <div className="text-[13px] text-muted">
          Bookings with status paid deposit, by booking date. Cancelled and full payment are left out. Loaded once a night at 00:45, so today fills in
          tomorrow.{dep?.first_date ? ` Records start ${dep.first_date}.` : ""}
        </div>
      </Card>

      <Card title="AI staff" right={<Link to="/ai-office" className="text-[13px] font-semibold">Open AI Office</Link>}>
        <div className="grid gap-4 sm:grid-cols-2">
          {STAFF.map((s) => {
            const on = s.who === "data" || s.who === "ads" || s.who === "plan" || (s.who === "ana" && (aiOn || Boolean(report)));
            return (
              <div key={s.who} className="flex items-center gap-3">
                <Avatar who={s.who} state={on ? "work" : "idle"} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">
                    {s.name} <span className="font-normal text-muted">· {s.role}</span>
                  </div>
                  <div className="text-[13px] text-muted">{s.who === "data" ? `Last sync ${when(t?.last_good_sync)}` : s.who === "ana" && report ? `Last study ${when(report.created_at)}` : s.who === "ana" && aiOn ? "Connected. First study at 02:10 tonight" : s.starts}</div>
                </div>
                <Pill tone={on ? "g" : "n"}>{s.who === "ads" || s.who === "plan" ? "On call" : on ? "Running" : "Not started"}</Pill>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Cost per pax deposit, last 30 days" right={<Link to="/analysis" className="text-[13px] font-semibold">Open Analysis</Link>}>
        <T
          minW={560}
          right={[1, 2, 3]}
          heads={["Country", "Spend", "Deposit pax", "Cost per pax", ""]}
          rows={(cost.data?.rows ?? [])
            .filter((r) => r.spend > 0 && r.country !== "Not tagged")
            .slice(0, 8)
            .map((r) => [<B>{r.country}</B>, rm(r.spend), count(r.pax_direct), perPax(r) === null ? "" : rm2(perPax(r)!), <Pill tone={paxTone(perPax(r))}>{paxLabel(perPax(r))}</Pill>])}
        />
        {(cost.data?.rows ?? []).filter((r) => r.spend > 0 && r.country !== "Not tagged").length === 0 && (
          <div className="text-sm">Nothing to show until campaigns are tagged with a country. Open Campaigns and apply the suggestions.</div>
        )}
        <div className="text-[13px] text-muted">An estimate by country, target RM50, limit RM80. Deposits from TravelCRM, loaded each night.</div>
      </Card>

      <Card title="Top spend, last 7 days" right={<Link to="/analysis" className="text-[13px] font-semibold">Open Analysis</Link>}>
        <T
          minW={720}
          right={[3, 4, 5]}
          heads={["Campaign", "Country", "Delivery", "Spend", "Leads (Meta)", "CPL"]}
          rows={top.map((c) => [
            <B>{c.name}</B>,
            c.country ? <Pill tone="t">{c.country}</Pill> : <Pill tone="a">Not tagged</Pill>,
            <Pill tone={delivery(c.delivery_status).tone}>{delivery(c.delivery_status).text}</Pill>,
            rm(c.spend),
            count(c.leads),
            cpl(c.spend, c.leads),
          ])}
        />
        {!week.loading && top.length === 0 && <div className="text-sm text-muted">No spend in the last 7 days.</div>}
      </Card>

    </>
  );
}
