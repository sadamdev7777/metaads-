import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { B, Card, PageHead, Pill, RunBy, T } from "../components/ui";
import { type AdSetRow, type CampaignRow, count, cpl, delivery, fetchTree, rm, useCampaigns, useMonthTotals, when } from "../lib/live";

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
  const [days, setDays] = useState("Last 30 days");
  const nDays = days === "Last 7 days" ? 7 : days === "This and last month" ? 60 : 30;
  const { data, loading, error } = useCampaigns(nDays);
  const totals = useMonthTotals();
  const [country, setCountry] = useState("All countries");
  const [open, setOpen] = useState<Record<string, AdSetRow[] | "loading">>({});

  const spent = useMemo(() => data.filter((c) => c.spend > 0), [data]);
  const byCountry = useMemo(() => groupBy(spent, (c) => c.country ?? NONE), [spent]);
  const byWho = useMemo(() => groupBy(spent, (c) => c.run_by ?? NONE), [spent]);
  const list = spent.filter((c) => country === "All countries" || (c.country ?? NONE) === country);
  const untagged = spent.filter((c) => !c.country);

  async function toggle(c: CampaignRow) {
    if (open[c.id]) return setOpen(({ [c.id]: _gone, ...rest }) => rest);
    setOpen((o) => ({ ...o, [c.id]: "loading" }));
    const tree = await fetchTree(c.id, nDays);
    setOpen((o) => ({ ...o, [c.id]: tree }));
  }

  const row = (g: Group, label: React.ReactNode) => [label, count(g.campaigns), rm(g.spend), count(g.leads), cpl(g.spend, g.leads), count(g.impressions), count(g.clicks)];
  const num = "border-b border-line px-3 py-[11px] text-right text-sm";
  const txt = "border-b border-line px-3 py-[11px] text-left text-sm";

  return (
    <>
      <PageHead
        title="Analysis"
        sub={`Step 4. Live from Meta Ads, campaigns with spend only. Last sync ${when(totals.data?.last_good_sync)}.`}
        right={
          <select aria-label="Period" value={days} onChange={(e) => { setDays(e.target.value); setOpen({}); }} className={INPUT}>
            {["Last 7 days", "Last 30 days", "This and last month"].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        }
      />

      {error && <div className="rounded-xl bg-[#FBE6E3] px-5 py-4 text-sm text-[#A3231B]">Could not load the figures: {error}</div>}
      {untagged.length > 0 && (
        <div className="rounded-xl bg-[#FBEFD5] px-5 py-4 text-sm">
          <B>{untagged.length} campaign{untagged.length === 1 ? "" : "s"} with spend are not tagged</B>, so {rm(untagged.reduce((n, c) => n + c.spend, 0))} sits under
          “Not tagged” below.{" "}
          <Link to="/campaigns" className="font-semibold">
            Tag them in Campaigns
          </Link>
        </div>
      )}

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
        These are Meta's own figures. Deposit pax and cost per pax are added when TravelCRM and the website form are connected: until then a campaign
        cannot be judged against the RM80 limit.
      </p>
    </>
  );
}
