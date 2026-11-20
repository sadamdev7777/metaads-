import { Link } from "react-router-dom";
import { Avatar, B, Card, PageHead, Pill, Stat, T } from "../components/ui";
import { STAFF } from "../lib/data";
import { count, cpl, delivery, rm, rm2, useCampaigns, useMonthTotals, when } from "../lib/live";

const linkBtn = "flex min-h-[44px] items-center rounded-lg border border-[#9AA39E] px-3.5 text-sm font-semibold text-ink no-underline";

export default function Dashboard() {
  const { data: t, error } = useMonthTotals();
  const week = useCampaigns(7);
  const running = week.data.filter((c) => c.delivery_status === "ACTIVE" || c.spend > 0);
  const untagged = running.filter((c) => !c.country);
  const top = week.data.filter((c) => c.spend > 0).slice(0, 8);
  const today = new Date().toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "short" });
  const failed = t?.last_sync && t.last_sync.ok === false;

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

      <div className="flex flex-wrap gap-4">
        <Stat label="Spend this month" value={t ? rm(t.spend) : "…"} sub="from Meta" />
        <Stat label="Leads this month" value={t ? count(t.leads) : "…"} sub="as counted by Meta" />
        <Stat label="Cost per lead" value={t && t.leads > 0 ? rm2(t.spend / t.leads) : "…"} sub="this month" />
        <Stat label="Active campaigns" value={t ? count(t.active) : "…"} sub={t ? `of ${count(t.campaigns)} in the ad account` : ""} />
      </div>

      <Card title="Cost per pax deposit" right={<Pill tone="a">Waiting for TravelCRM</Pill>}>
        <div className="text-sm">
          The RM50 target and RM80 limit need deposits from TravelCRM and leads from the website form. Until both are connected, the system shows Meta's
          spend and leads only, and does not judge any campaign.
        </div>
        <div>
          <Link to="/settings/integrations" className={`${linkBtn} inline-flex`}>
            Open Integrations
          </Link>
        </div>
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

      <Card title="AI staff" right={<Link to="/ai-office" className="text-[13px] font-semibold">Open AI Office</Link>}>
        <div className="grid gap-4 sm:grid-cols-2">
          {STAFF.map((s) => (
            <div key={s.who} className="flex items-center gap-3">
              <Avatar who={s.who} state={s.who === "data" ? "work" : "idle"} size={48} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">{s.name}</div>
                <div className="text-[13px] text-muted">{s.who === "data" ? `Last sync ${when(t?.last_good_sync)}` : s.starts}</div>
              </div>
              <Pill tone={s.who === "data" ? "g" : "n"}>{s.who === "data" ? "Running" : "Not started"}</Pill>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
