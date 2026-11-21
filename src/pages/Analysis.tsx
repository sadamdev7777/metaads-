import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { B, Btn, Card, PageHead, Pill, RunBy } from "../components/ui";
import { PERIODS, type AdSetRow, type CampaignRow, type DestCost, type Proposal, type Report, confTone, count, cpl, delivery, fetchLatestReport, fetchPendingProposals, fetchTreeIn, paxLabel, paxTone, perPax, period, rm, rm2, spanText, useCampaignsIn, useDestinationCostIn, useMonthTotals, when } from "../lib/live";

const INPUT = "min-h-[44px] rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";
const NONE = "Not tagged";
type Group = { key: string; campaigns: number; spend: number; leads: number };

function groupBy(rows: CampaignRow[], pick: (c: CampaignRow) => string): Group[] {
  const map = new Map<string, Group>();
  for (const c of rows) {
    const key = pick(c);
    const g = map.get(key) ?? { key, campaigns: 0, spend: 0, leads: 0 };
    g.campaigns += 1;
    g.spend += c.spend;
    g.leads += c.leads;
    map.set(key, g);
  }
  return Array.from(map.values()).sort((a, b) => b.spend - a.spend);
}

/** One headline figure. */
function Fig({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-white p-4">
      <div className="text-[12px] font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className="text-[24px] font-bold leading-none">{value}</div>
      {sub && <div className="text-[13px] text-muted">{sub}</div>}
    </div>
  );
}

/** Cost per pax drawn against the RM50 target and the RM80 limit. The scale ends at RM160. */
function PaxBar({ value }: { value: number | null }) {
  const pos = (v: number) => `${Math.min(100, (v / 160) * 100)}%`;
  const color = { g: "bg-[#2E8B62]", a: "bg-[#D08A00]", r: "bg-[#C2382E]", n: "bg-[#C9CFCB]" }[paxTone(value)];
  return (
    <div className="relative h-2 w-full rounded-full bg-[#E9EDEA]" aria-hidden="true">
      {value !== null && <div className={`h-2 rounded-full ${color}`} style={{ width: pos(value) }} />}
      <div className="absolute -top-1 h-4 w-px bg-[#2E8B62]" style={{ left: pos(50) }} />
      <div className="absolute -top-1 h-4 w-px bg-[#C2382E]" style={{ left: pos(80) }} />
    </div>
  );
}

export default function Analysis() {
  const [days, setDays] = useState("Last 7 days");
  const range = useMemo(() => period(days), [days]);
  const { data, loading, error } = useCampaignsIn(range);
  const totals = useMonthTotals();
  const cost = useDestinationCostIn(range);
  const [report, setReport] = useState<Report | null>(null);
  const [recs, setRecs] = useState<Proposal[]>([]);
  const [openRec, setOpenRec] = useState("");
  const [more, setMore] = useState(false);
  const [country, setCountry] = useState("All countries");
  const [cut, setCut] = useState<"Country" | "Run by">("Country");
  const [open, setOpen] = useState<Record<string, AdSetRow[] | "loading">>({});
  const [shown, setShown] = useState(12);
  useEffect(() => {
    void fetchLatestReport().then(setReport);
    void fetchPendingProposals().then(setRecs);
  }, []);

  const spent = useMemo(() => data.filter((c) => c.spend > 0), [data]);
  const sum = spent.reduce((t, c) => ({ spend: t.spend + c.spend, leads: t.leads + c.leads }), { spend: 0, leads: 0 });
  const untagged = spent.filter((c) => !c.country);

  // Destinations, best first: those with pax by cost per pax, then those with spend and no pax.
  const all = (cost.data?.rows ?? []).filter((r) => r.spend > 0 || r.pax > 0);
  const dests = all.filter((r) => r.matched && r.spend > 0);
  const ranked = [...dests].sort((a, b) => {
    const x = perPax(a), y = perPax(b);
    if (x !== null && y !== null) return x - y;
    if (x !== null) return -1;
    if (y !== null) return 1;
    return b.spend - a.spend;
  });
  const loosePax = all.filter((r) => !r.matched || r.country === "Unknown").reduce((n, r) => n + r.pax, 0);
  const paxAll = all.reduce((n, r) => n + r.pax, 0);
  const countries = Array.from(new Set(ranked.map((r) => r.country))).sort();
  const visible = ranked.filter((r) => country === "All countries" || r.country === country);
  const partial = Boolean(cost.data?.first_booking_date && cost.data.first_booking_date > range.from);
  const good = ranked.filter((r) => (perPax(r) ?? 999) <= 80).length;
  const noPaxSpend = ranked.filter((r) => r.pax_direct === 0).reduce((n, r) => n + r.spend, 0);

  const groups = useMemo(() => groupBy(spent, (c) => (cut === "Country" ? c.country ?? NONE : c.run_by ?? NONE)), [spent, cut]);
  const list = spent.filter((c) => country === "All countries" || (c.country ?? NONE) === country);

  async function toggle(c: CampaignRow) {
    if (open[c.id]) return setOpen(({ [c.id]: _gone, ...rest }) => rest);
    setOpen((o) => ({ ...o, [c.id]: "loading" }));
    const tree = await fetchTreeIn(c.id, range);
    setOpen((o) => ({ ...o, [c.id]: tree }));
  }
  const figures = (r: { spend: number; leads: number }) => (r.spend ? `${rm(r.spend)} · ${count(r.leads)} leads${r.leads ? ` · ${cpl(r.spend, r.leads)} each` : ""}` : "No spend");
  const summary = report?.summary ?? "";
  const short = summary.length > 260 && !more ? `${summary.slice(0, summary.lastIndexOf(". ", 260) + 1 || 260)}` : summary;

  return (
    <>
      <PageHead
        title="Analysis"
        sub={`${spanText(range)}. Last sync ${when(totals.data?.last_good_sync)}.`}
        right={
          <div className="flex flex-wrap gap-2">
            <select aria-label="Period" value={days} onChange={(e) => { setDays(e.target.value); setOpen({}); }} className={INPUT}>
              {PERIODS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <select aria-label="Country" value={country} onChange={(e) => { setCountry(e.target.value); setShown(12); }} className={INPUT}>
              {["All countries", ...countries].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
        }
      />

      {error && <div className="rounded-xl bg-[#FBE6E3] px-5 py-4 text-sm text-[#A3231B]">Could not load the figures: {error}</div>}

      {/* 1. The period in four figures */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Fig label="Ad spend" value={rm(sum.spend)} sub={`${count(spent.length)} campaigns with spend`} />
        <Fig label="Leads" value={count(sum.leads)} sub={sum.leads ? `${cpl(sum.spend, sum.leads)} each` : "None yet"} />
        <Fig label="Deposit pax" value={count(paxAll)} sub={sum.leads ? `${((paxAll / sum.leads) * 100).toFixed(0)}% of leads` : ""} />
        <Fig label="Under the RM80 limit" value={`${good} of ${ranked.length}`} sub="destinations" />
      </div>

      {/* 2. What to do */}
      <Card title="What Luqman recommends" right={report ? <span className="text-[13px] text-muted">{when(report.created_at)}</span> : undefined}>
        {!report ? (
          <div className="text-sm">No study yet. Luqman studies the ads every night at 02:10.</div>
        ) : (
          <>
            <div className="text-[15px] leading-relaxed">
              {short}{" "}
              {summary.length > 260 && (
                <button type="button" onClick={() => setMore(!more)} className="border-0 bg-transparent p-0 text-[15px] font-semibold text-brand underline">
                  {more ? "Show less" : "Read more"}
                </button>
              )}
            </div>
            {recs.length === 0 ? (
              <div className="text-sm text-muted">No open recommendations: they have all been decided.</div>
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-lg border border-line p-0">
                {recs.map((r, i) => {
                  const isOpen = openRec === r.id;
                  return (
                    <li key={r.id}>
                      <button type="button" aria-expanded={isOpen} onClick={() => setOpenRec(isOpen ? "" : r.id)} className="flex w-full items-start gap-2.5 border-0 bg-transparent px-3 py-3 text-left">
                        <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-[#8A5300]">{r.action_type}</span>
                          <span className="block break-words text-sm font-bold text-ink">{r.target}</span>
                          {!isOpen && <span className="mt-0.5 block text-[13px] text-muted">{r.reason}</span>}
                        </span>
                        <span className="flex flex-none flex-col items-end gap-1">
                          <Pill tone={confTone(r.confidence)}>{r.confidence ?? "?"}</Pill>
                          <span className="text-[12px] text-muted">{isOpen ? "Close" : "Details"}</span>
                        </span>
                      </button>
                      {isOpen && (
                        <dl className="m-0 flex flex-col gap-2.5 px-3 pb-3.5 pl-[46px] text-sm">
                          <div>
                            <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">Why</dt>
                            <dd className="m-0">{r.reason}</dd>
                            {r.numbers && <dd className="m-0 text-[13px] text-muted">{r.numbers}</dd>}
                          </div>
                          {r.cause && (
                            <div>
                              <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">What is behind it</dt>
                              <dd className="m-0">{r.cause}</dd>
                            </div>
                          )}
                          <div className="rounded-lg bg-[#E6F1EE] px-3 py-2.5">
                            <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">What to change</dt>
                            <dd className="m-0 font-semibold">{r.how ?? r.action_type}</dd>
                            {r.expected && <dd className="m-0 mt-0.5 text-[13px]">{r.expected}</dd>}
                          </div>
                        </dl>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/approvals" className="inline-flex min-h-[44px] items-center rounded-lg bg-brand px-4 text-sm font-bold text-white no-underline">
                Decide in Approvals
              </Link>
              <Link to="/ai-office" className="text-sm font-semibold">Full report</Link>
            </div>
          </>
        )}
      </Card>

      {/* 3. Which destinations earn their spend */}
      <Card title="Destinations, best first" sub="Ad spend for each deposit pax. Green line RM50 target, red line RM80 limit.">
        {partial && (
          <div className="rounded-lg bg-[#FBEFD5] px-3 py-2 text-[13px]">
            Deposit records start {spanText({ from: cost.data!.first_booking_date!, to: cost.data!.first_booking_date! })}, so pax is undercounted for this period and costs read too high.
          </div>
        )}
        {!cost.loading && visible.length === 0 && <div className="text-sm text-muted">No spend in this period.</div>}
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {visible.map((r: DestCost) => {
            const v = perPax(r);
            return (
              <li key={`${r.country}-${r.destination}`} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="min-w-0 break-words text-sm font-bold">{r.destination ?? r.country}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-base font-bold tabular-nums">{v === null ? "No pax" : rm2(v)}</span>
                    <Pill tone={paxTone(v)}>{v === null ? "No deposit" : paxLabel(v)}</Pill>
                  </span>
                </div>
                <PaxBar value={v} />
                <div className="text-[13px] text-muted">
                  {rm(r.spend)} spent · {count(r.pax_direct)} pax · {count(r.leads)} leads{r.leads ? ` (${((r.pax_direct / r.leads) * 100).toFixed(0)}% became pax)` : ""}
                  {r.pax_shared ? ` · ${count(r.pax_shared)} likely agent pax left out` : ""}
                </div>
              </li>
            );
          })}
        </ul>
        {(noPaxSpend > 0 || loosePax > 0 || untagged.length > 0) && (
          <div className="flex flex-col gap-1 rounded-lg bg-ground px-3 py-2.5 text-[13px]">
            {noPaxSpend > 0 && <div><B>{rm(noPaxSpend)}</B> went to destinations with no deposit in this period.</div>}
            {loosePax > 0 && (
              <div>
                <B>{count(loosePax)} pax</B> have no destination yet, so real costs are lower than shown.{" "}
                <Link to="/settings/destinations" className="font-semibold">Give them a destination</Link>
              </div>
            )}
            {untagged.length > 0 && (
              <div>
                <B>{untagged.length} campaign{untagged.length === 1 ? "" : "s"}</B> with {rm(untagged.reduce((n, c) => n + c.spend, 0))} of spend match no destination.{" "}
                <Link to="/campaigns" className="font-semibold">Set them</Link>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 4. Spend and leads, by country or by person */}
      <Card
        title="Spend and leads"
        right={
          <div role="tablist" aria-label="Group by" className="inline-flex rounded-lg border border-line bg-white p-1">
            {(["Country", "Run by"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={cut === k} onClick={() => setCut(k)} className={`min-h-[36px] rounded-md border-0 px-3 text-[13px] font-semibold ${cut === k ? "bg-brand text-white" : "bg-transparent text-ink"}`}>
                {k}
              </button>
            ))}
          </div>
        }
      >
        {!loading && groups.length === 0 && <div className="text-sm text-muted">No spend in this period yet.</div>}
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {groups.map((g) => (
            <li key={g.key} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-semibold">{g.key === NONE ? <Pill tone="a">{NONE}</Pill> : cut === "Run by" ? <RunBy k={g.key} /> : g.key}</span>
                <span className="tabular-nums">
                  <B>{rm(g.spend)}</B> <span className="text-muted">· {count(g.leads)} leads{g.leads ? ` · ${cpl(g.spend, g.leads)} each` : ""}</span>
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[#E9EDEA]" aria-hidden="true">
                <div className="h-1.5 rounded-full bg-brand" style={{ width: `${sum.spend ? Math.max(1.5, (g.spend / sum.spend) * 100) : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* 5. Down to the ad */}
      <Card title="Campaigns, down to the ad" sub="Most spend first. Open one to compare its ad sets and ads by cost per lead.">
        {!loading && list.length === 0 && <div className="text-sm text-muted">No campaign with spend in this period.</div>}
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {list.slice(0, shown).map((c) => {
            const kids = open[c.id];
            const d = delivery(c.delivery_status);
            const avg = c.leads ? c.spend / c.leads : null;
            const tone = (r: { spend: number; leads: number }) => (!avg || r.spend < 50 ? "" : !r.leads ? "text-[#A3231B]" : r.spend / r.leads > avg * 1.5 ? "text-[#A3231B]" : r.spend / r.leads < avg * 0.75 ? "text-[#17663F]" : "");
            return (
              <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/campaigns/${c.id}`} className="break-words text-sm font-bold">{c.name}</Link>
                      <Pill tone={d.tone}>{d.text}</Pill>
                    </div>
                    <div className="text-[13px] text-muted">
                      {figures(c)}
                      {c.run_by ? ` · ${c.run_by}` : ""}
                    </div>
                  </div>
                  <Btn small kind="s" className="flex-none" onClick={() => void toggle(c)}>{kids ? "Hide" : "Ads"}</Btn>
                </div>
                {kids === "loading" && <div className="mt-2 text-sm text-muted">Loading…</div>}
                {Array.isArray(kids) && (
                  <div className="mt-2 flex flex-col gap-2 rounded-lg bg-ground p-3">
                    {kids.length === 0 && <div className="text-sm text-muted">No ad sets with spend in this period.</div>}
                    {kids.map((s) => (
                      <div key={s.id}>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                          <span className="min-w-0 break-words font-semibold">{s.name}</span>
                          <span className={`text-[13px] tabular-nums ${tone(s)}`}>{figures(s)}</span>
                        </div>
                        <ul className="m-0 mt-1 flex list-none flex-col gap-1 border-l-2 border-line p-0 pl-3">
                          {s.ads.map((a) => (
                            <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
                              <span className="min-w-0 break-words">
                                {a.name} {a.delivery_status !== "ACTIVE" && <span className="text-muted">({delivery(a.delivery_status).text.toLowerCase()})</span>}
                              </span>
                              <span className={`tabular-nums ${tone(a) || "text-muted"}`}>{figures(a)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <div className="text-[12px] text-muted">Green is well under this campaign's average cost per lead, red is well over or has no leads.</div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {list.length > shown && (
          <div>
            <Btn kind="s" onClick={() => setShown((n) => n + 12)}>Show {Math.min(12, list.length - shown)} more</Btn>
          </div>
        )}
      </Card>

      <details className="rounded-xl border border-line bg-white px-4 py-3 text-[13px] text-muted">
        <summary className="cursor-pointer text-sm font-semibold text-ink">How to read these figures</summary>
        <div className="mt-2 flex flex-col gap-1.5">
          <div>Spend and leads are Meta's own figures. Deposit pax is bookings with status paid deposit in TravelCRM, by booking date{cost.data?.last_synced ? `, last loaded ${when(cost.data.last_synced)}` : ""}.</div>
          <div>Cost per pax is an estimate. Deposits are matched to a destination, not to one campaign or ad, so inside a destination compare campaigns and ads by cost per lead.</div>
          <div>“Likely agent pax” are bookings whose contact number appears on 3 or more bookings. They are left out of cost per pax. Repeat customers and other channels are still counted, so the true cost from ads alone is higher than shown.</div>
          <div>Luqman's study always covers the last 30 days, whatever period is chosen above.</div>
        </div>
      </details>
    </>
  );
}
