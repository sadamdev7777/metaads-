import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { B, Card, PageHead, Pill, RunBy, T } from "../components/ui";
import { useEffect } from "react";
import { PERIODS, type AdSetRow, type CampaignRow, type Proposal, type Report, confTone, count, cpl, delivery, fetchLatestReport, fetchPendingProposals, fetchTreeIn, paxLabel, paxTone, perPax, period, rm, rm2, useCampaignsIn, useDestinationCostIn, useMonthTotals, when } from "../lib/live";

const INPUT = "min-h-[44px] rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";
type Group = { key: string; campaigns: number; spend: number; leads: number; impressions: number; clicks: number };

function groupBy(rows: CampaignRow[], pick: (c: CampaignRow) => string): Group[] {
  const map = new Map<string, Group>();
  for (const c of rows) {
    const key = pick(c);
    const g = map.get(key) ?? { key, campaigns: 0, spend: 0, leads: 0, impressions: 0, clicks: 0 };
    g.campaigns += 1;
    g.spend += c.spend;
    g.leads += c.leads;
    g.impressions += c.impressions;
    g.clicks += c.clicks;
    map.set(key, g);
  }
  return Array.from(map.values()).sort((a, b) => b.spend - a.spend);
}
const total = (list: Group[]): Group => list.reduce((t, g) => ({ key: "Total", campaigns: t.campaigns + g.campaigns, spend: t.spend + g.spend, leads: t.leads + g.leads, impressions: t.impressions + g.impressions, clicks: t.clicks + g.clicks }), { key: "Total", campaigns: 0, spend: 0, leads: 0, impressions: 0, clicks: 0 });
const NONE = "Not tagged";

export default function Analysis() {
  const [days, setDays] = useState("Last 7 days");
  const range = useMemo(() => period(days), [days]);
  const nDays = range.days;
  const { data, loading, error } = useCampaignsIn(range);
  const [report, setReport] = useState<Report | null>(null);
  const [recs, setRecs] = useState<Proposal[]>([]);
  useEffect(() => {
    void fetchLatestReport().then(setReport);
    void fetchPendingProposals().then(setRecs);
  }, []);
  const totals = useMonthTotals();
  const [country, setCountry] = useState("All countries");
  const cost = useDestinationCostIn(range);
  const costRows = (cost.data?.rows ?? []).filter((r) => r.spend > 0 || r.pax > 0);
  const costCountries = Array.from(new Set(costRows.map((r) => r.country)));
  const windowStart = range.from;
  const partial = Boolean(cost.data?.first_booking_date && cost.data.first_booking_date > windowStart);
  const [open, setOpen] = useState<Record<string, AdSetRow[] | "loading">>({});

  const spent = useMemo(() => data.filter((c) => c.spend > 0), [data]);
  const byCountry = useMemo(() => groupBy(spent, (c) => c.country ?? NONE), [spent]);
  const byWho = useMemo(() => groupBy(spent, (c) => c.run_by ?? NONE), [spent]);
  const list = spent.filter((c) => country === "All countries" || (c.country ?? NONE) === country);
  const untagged = spent.filter((c) => !c.country);

  async function toggle(c: CampaignRow) {
    if (open[c.id]) return setOpen(({ [c.id]: _gone, ...rest }) => rest);
    setOpen((o) => ({ ...o, [c.id]: "loading" }));
    const tree = await fetchTreeIn(c.id, range);
    setOpen((o) => ({ ...o, [c.id]: tree }));
  }

  const row = (g: Group, label: React.ReactNode) => [label, count(g.campaigns), rm(g.spend), count(g.leads), cpl(g.spend, g.leads), count(g.impressions), count(g.clicks)];
  const num = "border-b border-line px-3 py-[11px] text-right text-sm";
  const txt = "border-b border-line px-3 py-[11px] text-left text-sm";

  return (
    <>
      <PageHead
        title="Analysis"
        sub={`Step 4. ${range.from === range.to ? range.from : `${range.from} to ${range.to}`}. Campaigns with spend only. Last sync ${when(totals.data?.last_good_sync)}.`}
        right={
          <select aria-label="Period" value={days} onChange={(e) => { setDays(e.target.value); setOpen({}); }} className={INPUT}>
            {PERIODS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        }
      />

      {error && <div className="rounded-xl bg-[#FBE6E3] px-5 py-4 text-sm text-[#A3231B]">Could not load the figures: {error}</div>}

      <Card
        title="What Luqman recommends"
        right={report ? <div className="text-[13px] text-muted">Studied {when(report.created_at)}, last 30 days</div> : undefined}
      >
        {report ? (
          <>
            <div className="text-[15px] leading-relaxed">{report.summary}</div>
            {recs.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {recs.map((r, i) => (
                  <div key={r.id} className="rounded-lg border border-line px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
                      <Pill tone="a">{r.action_type}</Pill>
                      <B>{r.target}</B>
                      <Pill tone={confTone(r.confidence)}>{r.confidence ?? "?"} confidence</Pill>
                    </div>
                    <div className="mt-2 grid gap-x-6 gap-y-1.5 text-sm md:grid-cols-2">
                      <div>
                        <span className="text-[12px] font-bold uppercase text-muted">Why</span>
                        <div>{r.reason}</div>
                        {r.numbers && <div className="text-[13px] font-semibold">{r.numbers}</div>}
                        {r.cause && (
                          <div className="mt-1.5">
                            <span className="text-[12px] font-bold uppercase text-muted">Luqman's view: what is behind it</span>
                            <div>{r.cause}</div>
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="text-[12px] font-bold uppercase text-muted">What to change</span>
                        <div>{r.how ?? r.action_type}</div>
                        {r.expected && <div className="text-[13px] text-muted">Expected: {r.expected}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted">No open recommendations: they have all been decided, or none were made.</div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/approvals" className="inline-flex min-h-[44px] items-center rounded-lg bg-brand px-4 text-sm font-bold text-white no-underline">
                Decide in Approvals
              </Link>
              <Link to="/ai-office" className="text-sm font-semibold">Full report and notebook</Link>
            </div>
            <div className="text-xs text-muted">Written by an AI model from Meta figures and deposits by country. His study always covers the last 30 days, whatever period is chosen above. Check the numbers before acting.</div>
          </>
        ) : (
          <div className="text-sm">No study yet. Luqman studies the ads every night at 02:10, or press Study the ads now in AI Office.</div>
        )}
      </Card>
      {untagged.length > 0 && (
        <div className="rounded-xl bg-[#FBEFD5] px-5 py-4 text-sm">
          <B>{untagged.length} campaign{untagged.length === 1 ? "" : "s"} with spend are not matched to a destination</B>, so {rm(untagged.reduce((n, c) => n + c.spend, 0))} sits under
          “Not tagged” below.{" "}
          <Link to="/settings/destinations" className="font-semibold">
            Fix it in Settings, Destinations
          </Link>
        </div>
      )}

      <Card title="Cost per pax deposit, by destination" sub="Ad spend from Meta against deposit pax from TravelCRM, for the same days. An estimate: deposits are not matched to individual ads.">
        {partial && (
          <div className="rounded-lg bg-[#FBEFD5] px-3 py-2 text-[13px]">
            Deposits are loaded only from {cost.data?.first_booking_date}, so pax is undercounted and cost per pax reads too high for this period. The
            nightly load fills the rest.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                {["Destination", "Campaigns", "Spend", "Leads (Meta)", "Deposit pax", "Likely agent pax", "Cost per pax", "Against RM50 / RM80"].map((h, i) => (
                  <th key={h} className={`whitespace-nowrap border-b border-line px-3 py-2.5 text-xs font-semibold text-muted ${i >= 1 && i <= 6 ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {costCountries.map((cn) => {
                const group = costRows.filter((r) => r.country === cn);
                const sumRow = group.reduce((t, r) => ({ spend: t.spend + r.spend, leads: t.leads + r.leads, campaigns: t.campaigns + r.campaigns, pax: t.pax + r.pax, pax_direct: t.pax_direct + r.pax_direct, pax_shared: t.pax_shared + r.pax_shared }), { spend: 0, leads: 0, campaigns: 0, pax: 0, pax_direct: 0, pax_shared: 0 });
                const line = (label: React.ReactNode, r: typeof sumRow, head: boolean, judge: boolean, key: string) => {
                  const v = perPax(r);
                  return (
                    <tr key={key} style={head ? { background: "#F1F4F1" } : undefined}>
                      <td className={`${txt} ${head ? "font-bold" : ""}`} style={head ? undefined : { paddingLeft: 30 }}>{label}</td>
                      <td className={num}>{r.campaigns ? count(r.campaigns) : ""}</td>
                      <td className={num}>{r.spend ? rm(r.spend) : ""}</td>
                      <td className={num}>{r.leads ? count(r.leads) : ""}</td>
                      <td className={num}>{r.pax ? count(r.pax) : ""}</td>
                      <td className={num}>{r.pax_shared ? count(r.pax_shared) : ""}</td>
                      <td className={`${num} ${head ? "font-bold" : ""}`}>{v === null ? "" : rm2(v)}</td>
                      <td className={txt}>{judge && r.spend > 0 ? <Pill tone={paxTone(v)}>{paxLabel(v)}</Pill> : ""}</td>
                    </tr>
                  );
                };
                const loose = cn === "Unknown" || cn === "Not matched";
                return (
                  <Fragment key={cn}>
                    {line(loose ? <Pill tone="a">{cn === "Unknown" ? "Deposits with no package details" : "Campaigns not matched"}</Pill> : cn, sumRow, true, !loose, `c-${cn}`)}
                    {group.filter((r) => r.matched && (group.length > 1 || r.destination !== cn)).map((r) => line(r.destination, r, false, true, `d-${r.destination}`))}
                    {!loose && group.filter((r) => !r.matched).map((r) => line(<span className="text-muted">Other {cn} deposits, no destination</span>, r, false, false, `x-${cn}`))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {!cost.loading && costRows.length === 0 && <div className="text-sm text-muted">No spend or deposits in this period.</div>}
        <div className="text-[13px] text-muted">
          Cost per pax leaves out “likely agent” pax: bookings whose contact number appears on 3 or more bookings, which look like agent or staff
          entries. Deposits from repeat customers and other channels are still counted, so the true cost from ads alone is higher than shown. Change
          what counts together in <Link to="/settings/destinations" className="font-semibold">Settings, Destinations</Link>. Last loaded {when(cost.data?.last_synced)}.
        </div>
      </Card>

      <Card title="By country">
        <T
          minW={760}
          right={[1, 2, 3, 4, 5, 6]}
          heads={["Country", "Campaigns", "Spend", "Leads (Meta)", "CPL", "Impressions", "Link clicks"]}
          rows={[...byCountry.map((g) => row(g, g.key === NONE ? <Pill tone="a">{NONE}</Pill> : <B>{g.key}</B>)), ...(byCountry.length ? [row(total(byCountry), <B>Total</B>)] : [])]}
        />
        {!loading && byCountry.length === 0 && <div className="text-sm text-muted">No spend in this period yet.</div>}
      </Card>

      <Card title="By who ran the campaign" sub="Taken from the Run by tag on each campaign.">
        <T
          minW={760}
          right={[1, 2, 3, 4, 5, 6]}
          heads={["Run by", "Campaigns", "Spend", "Leads (Meta)", "CPL", "Impressions", "Link clicks"]}
          rows={[...byWho.map((g) => row(g, g.key === NONE ? <Pill tone="a">{NONE}</Pill> : <RunBy k={g.key} />)), ...(byWho.length ? [row(total(byWho), <B>Total</B>)] : [])]}
        />
      </Card>

      <Card
        title="Campaign, ad set, ad"
        right={
          <select aria-label="Country" value={country} onChange={(e) => setCountry(e.target.value)} className={INPUT}>
            {["All countries", ...byCountry.map((g) => g.key)].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        }
        className="!p-3"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                {["Name", "Country", "Run by", "Delivery", "Spend", "Leads (Meta)", "CPL", "Link clicks", ""].map((h, i) => (
                  <th key={i} className={`whitespace-nowrap border-b border-line px-3 py-2.5 text-xs font-semibold text-muted ${i >= 4 && i <= 7 ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const kids = open[c.id];
                const d = delivery(c.delivery_status);
                return (
                  <Fragment key={c.id}>
                    <tr style={{ background: "#F1F4F1" }}>
                      <td className={`${txt} font-bold`}>{c.name}</td>
                      <td className={txt}>{c.country ? <Pill tone="t">{c.country}</Pill> : <Pill tone="a">{NONE}</Pill>}</td>
                      <td className={txt}>{c.run_by ? <RunBy k={c.run_by} /> : ""}</td>
                      <td className={txt}>
                        <Pill tone={d.tone}>{d.text}</Pill>
                      </td>
                      <td className={num}>{rm(c.spend)}</td>
                      <td className={num}>{count(c.leads)}</td>
                      <td className={num}>{cpl(c.spend, c.leads)}</td>
                      <td className={num}>{count(c.clicks)}</td>
                      <td className={txt}>
                        <button type="button" aria-expanded={Boolean(kids)} onClick={() => void toggle(c)} className="min-h-[44px] whitespace-nowrap rounded-lg border border-[#9AA39E] bg-white px-3 text-[13px] font-semibold">
                          {kids ? "Hide ads" : "Show ads"}
                        </button>
                      </td>
                    </tr>
                    {kids === "loading" && (
                      <tr>
                        <td colSpan={9} className={`${txt} text-muted`}>
                          Loading…
                        </td>
                      </tr>
                    )}
                    {Array.isArray(kids) &&
                      kids.map((s) => (
                        <Fragment key={s.id}>
                          <tr>
                            <td className={`${txt} font-semibold`} style={{ paddingLeft: 30 }}>
                              <span className="mr-2 text-[11px] font-bold uppercase text-muted">Ad set</span>
                              {s.name}
                            </td>
                            <td className={txt} />
                            <td className={txt} />
                            <td className={txt}>
                              <Pill tone={delivery(s.delivery_status).tone}>{delivery(s.delivery_status).text}</Pill>
                            </td>
                            <td className={num}>{s.spend ? rm(s.spend) : ""}</td>
                            <td className={num}>{s.leads ? count(s.leads) : ""}</td>
                            <td className={num}>{cpl(s.spend, s.leads)}</td>
                            <td className={num}>{s.clicks ? count(s.clicks) : ""}</td>
                            <td className={txt} />
                          </tr>
                          {s.ads.map((a) => (
                            <tr key={a.id}>
                              <td className={txt} style={{ paddingLeft: 56 }}>
                                <span className="mr-2 text-[11px] font-bold uppercase text-muted">Ad</span>
                                {a.name}
                              </td>
                              <td className={txt} />
                              <td className={txt} />
                              <td className={txt}>
                                <Pill tone={delivery(a.delivery_status).tone}>{delivery(a.delivery_status).text}</Pill>
                              </td>
                              <td className={num}>{a.spend ? rm(a.spend) : ""}</td>
                              <td className={num}>{a.leads ? count(a.leads) : ""}</td>
                              <td className={num}>{cpl(a.spend, a.leads)}</td>
                              <td className={num}>{a.clicks ? count(a.clicks) : ""}</td>
                              <td className={txt} />
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && list.length === 0 && <div className="px-3 py-4 text-sm text-muted">No campaign with spend in this period.</div>}
      </Card>

      <p className="m-0 text-[13px] text-muted">
        Spend, leads and clicks are Meta's own figures. Cost per pax is judged by country only: inside a country, compare campaigns and ads by cost
        per lead.
      </p>
    </>
  );
}
