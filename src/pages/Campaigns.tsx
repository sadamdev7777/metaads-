import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { B, Btn, Card, PageHead, Pill, RunBy, Mini } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useEffect } from "react";
import { type CampaignRow, type Destination, count, cpl, delivery, PERIODS, fetchDepartures, fetchDestinations, guessRunBy, period, rm, saveTag, syncNow, useCampaignsIn, useMonthTotals, when, spanText } from "../lib/live";
import { useStore } from "../lib/store";
import { ScheduleStrip } from "../components/AdSchedule";
import { DestPicker } from "../components/DestPicker";

const INPUT = "min-h-[40px] sm:min-h-[44px] rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";
const PAGE = 50;

function Pick({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex min-w-[150px] flex-1 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

export default function Campaigns() {
  const { act } = useStore();
  const { user } = useAuth();
  const [days, setDays] = useState("Last 7 days");
  const range = useMemo(() => period(days), [days]);
  const { data, loading, error, reload, setData } = useCampaignsIn(range);
  const totals = useMonthTotals();
  const [country, setCountry] = useState("All countries");
  const [runBy, setRunBy] = useState("Everyone");
  const [show, setShow] = useState("Active or with spend");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [edit, setEdit] = useState<{ id: string; dest: string; runBy: string } | null>(null);
  const [dests, setDests] = useState<Destination[]>([]);
  const [selling, setSelling] = useState<Set<string>>(new Set());
  useEffect(() => {
    void fetchDestinations().then(setDests);
    // Destinations that have a departure still to come: worth an ad.
    void fetchDepartures().then((r) => {
      const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
      setSelling(new Set(r.departures.filter((d) => d.destination_id && (d.departure_date ?? "") >= today && (d.seats_available ?? 1) > 0).map((d) => String(d.destination_id))));
    });
  }, []);
  const COUNTRIES = useMemo(() => Array.from(new Set(dests.map((d) => d.country))).sort(), [dests]);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState(false);

  const people = useMemo(() => Array.from(new Set(data.map((c) => c.run_by).filter(Boolean) as string[])).sort(), [data]);
  const rows = useMemo(() => {
    const text = q.trim().toLowerCase();
    const kept = data.filter((c) => {
      if (show === "Active or with spend" && !(c.delivery_status === "ACTIVE" || c.spend > 0)) return false;
      if (show === "Active only" && c.delivery_status !== "ACTIVE") return false;
      if (show === "Not tagged" && c.destination_id) return false;
      if (country !== "All countries" && (country === "Not tagged" ? Boolean(c.country) : c.country !== country)) return false;
      if (runBy !== "Everyone" && c.run_by !== runBy) return false;
      return !text || c.name.toLowerCase().includes(text);
    });
    // Campaigns with no destination come first, so they are the first thing to fix. Then country by country,
    // the country with the most spend first.
    const spendOf = new Map<string, number>();
    for (const c of kept) spendOf.set(c.country ?? "", (spendOf.get(c.country ?? "") ?? 0) + c.spend);
    const regionSpend = new Map<string, number>();
    for (const c of kept) regionSpend.set(c.destination_id ?? "", (regionSpend.get(c.destination_id ?? "") ?? 0) + c.spend);
    return [...kept].sort((a, b) => Number(Boolean(a.country)) - Number(Boolean(b.country)) || (spendOf.get(b.country ?? "") ?? 0) - (spendOf.get(a.country ?? "") ?? 0) || (a.country ?? "").localeCompare(b.country ?? "") || (regionSpend.get(b.destination_id ?? "") ?? 0) - (regionSpend.get(a.destination_id ?? "") ?? 0) || (a.destination ?? "").localeCompare(b.destination ?? "") || b.spend - a.spend);
  }, [data, show, country, runBy, q]);

  // One card per country: what is running, and which of its regions have no ad.
  const byCountry = useMemo(() => {
    const names = Array.from(new Set([...dests.map((d) => d.country), ...data.map((c) => c.country).filter(Boolean) as string[]]));
    return names
      .map((name) => {
        const camps = data.filter((c) => c.country === name);
        const running = camps.filter((c) => c.delivery_status === "ACTIVE");
        const regions = dests.filter((d) => d.country === name);
        const bare = regions.filter((d) => !running.some((c) => c.destination_id === d.id));
        const short = (d: Destination) => (d.name.toLowerCase() === name.toLowerCase() ? name : d.name.replace(new RegExp(`^${name}\\s*[-–:]\\s*`, "i"), ""));
        return {
          name, running: running.length, spend: camps.reduce((n, c) => n + c.spend, 0), leads: camps.reduce((n, c) => n + c.leads, 0), regions: regions.length,
          bare: bare.map(short), toSell: bare.filter((d) => selling.has(d.id)).map(short),
        };
      })
      .sort((a, b) => Number(b.running > 0) - Number(a.running > 0) || b.spend - a.spend || a.name.localeCompare(b.name));
  }, [data, dests, selling]);
  const noAds = byCountry.filter((c) => c.running === 0);

  const relevant = data.filter((c) => c.delivery_status === "ACTIVE" || c.spend > 0);
  const untagged = relevant.filter((c) => !c.destination_id);
  const untaggedSpend = untagged.reduce((n, c) => n + c.spend, 0);
  const sum = rows.reduce((t, c) => ({ spend: t.spend + c.spend, leads: t.leads + c.leads }), { spend: 0, leads: 0 });

  async function save(c: CampaignRow) {
    if (!edit) return;
    setBusy(true);
    const dest = dests.find((d) => d.id === edit.dest) ?? null;
    const nextRunBy = edit.runBy.trim() || null;
    const err = await saveTag(c.id, dest, nextRunBy, user?.email ?? "");
    setBusy(false);
    if (err) return act(`Tagging ${c.name} failed`, "Campaigns", err);
    setData((list) => list.map((x) => (x.id === c.id ? { ...x, destination_id: dest?.id ?? null, destination: dest?.name ?? null, country: dest?.country ?? null, destination_manual: true, run_by: nextRunBy } : x)));
    setEdit(null);
    act(`Set destination of ${c.name} to ${dest?.name ?? "none"}, run by ${nextRunBy ?? "none"}`, "Campaigns", "Saved. This one is now set by hand and will not be changed by the list.");
  }
  async function sync() {
    setBusy(true);
    const r = await syncNow();
    setBusy(false);
    act(r.ok ? "Synced with Meta" : "Sync with Meta failed", "Campaigns", r.ok ? "Synced. Figures are up to date." : r.error ?? "Sync failed.");
    await Promise.all([reload(), totals.reload()]);
  }

  const last = totals.data?.last_good_sync;
  const activeFilters = [show !== "Active or with spend", country !== "All countries", runBy !== "Everyone", q.trim() !== ""].filter(Boolean).length;
  type PhoneRegion = { key: string; name: string; items: typeof rows; spend: number; leads: number };
  const phoneSections = rows.slice(0, shown).reduce<{ key: string; country: string | null; running: number; spend: number; regions: PhoneRegion[] }[]>((out, c) => {
    let sec = out[out.length - 1];
    if (!sec || sec.country !== (c.country ?? null)) {
      const all = rows.filter((x) => (x.country ?? null) === (c.country ?? null));
      sec = { key: c.country ?? "none", country: c.country ?? null, running: all.filter((x) => x.delivery_status === "ACTIVE").length, spend: all.reduce((n, x) => n + x.spend, 0), regions: [] };
      out.push(sec);
    }
    const rk = c.destination_id ?? "none";
    let reg = sec.regions[sec.regions.length - 1];
    if (!reg || reg.key !== rk) {
      const name = !c.destination ? "No region" : c.destination.toLowerCase() === (c.country ?? "").toLowerCase() ? "Whole country" : c.destination.replace(new RegExp(`^${c.country}\\s*[-–:]\\s*`, "i"), "");
      const all = rows.filter((x) => (x.destination_id ?? "none") === rk && (x.country ?? null) === (c.country ?? null));
      reg = { key: rk, name, items: [], spend: all.reduce((n, x) => n + x.spend, 0), leads: all.reduce((n, x) => n + x.leads, 0) };
      sec.regions.push(reg);
    }
    reg.items.push(c);
    return out;
  }, []);

  return (
    <>
      <PageHead
        title="Campaigns"
        sub={`Step 3. Live from Meta Ads. Last sync ${when(last)}. Open a campaign to pause, turn on, change a budget or add an ad.`}
        right={
          <div className="flex items-center gap-2">
            <Btn kind="s" disabled={busy} onClick={() => void sync()}>
              {busy ? "Working…" : "Sync now"}
            </Btn>
            <Link to="/campaigns/new" className="flex min-h-[36px] sm:min-h-[44px] items-center rounded-lg bg-brand px-4 text-sm font-bold text-white no-underline">
              Run campaign
            </Link>
          </div>
        }
      />

      <ScheduleStrip />
      {error && <div className="rounded-xl bg-[#FBE6E3] px-3.5 py-3 sm:px-5 sm:py-4 text-sm text-[#A3231B]">Could not load campaigns: {error}</div>}

      {untagged.length > 0 && (
        <div className="flex flex-wrap items-center gap-3.5 rounded-xl bg-[#FBEFD5] px-3.5 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0 flex-[1_1_360px]">
            <div className="text-sm font-bold text-[#5C3900]">
              {untagged.length} running campaign{untagged.length === 1 ? " is" : "s are"} not matched to a destination
            </div>
            <div className="text-sm">
              {rm(untaggedSpend)} of spend in this period is not counted anywhere. Add the destination or a keyword in Settings, Destinations, or set
              it by hand here.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/settings/destinations" className="flex min-h-[36px] sm:min-h-[44px] items-center rounded-lg bg-brand px-4 text-sm font-bold text-white no-underline">
              Open Destinations
            </Link>
            <Btn
              kind="s"
              onClick={() => {
                setShow("Not tagged");
                setShown(PAGE);
              }}
            >
              Show them
            </Btn>
          </div>
        </div>
      )}

      <Card title="By country" sub={`What is running now, and where there is no ad. ${noAds.length ? `${noAds.length} ${noAds.length === 1 ? "country has" : "countries have"} no ad running.` : "Every country has an ad running."} Tap a country to see only its campaigns.`}>
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5 md:grid-cols-3 xl:grid-cols-4">
          {byCountry.map((c) => {
            const on = country === c.name;
            return (
              <button
                key={c.name}
                type="button"
                aria-pressed={on}
                onClick={() => { setCountry(on ? "All countries" : c.name); if (!on && c.running === 0) setShow("Everything"); setShown(PAGE); }}
                className={`flex min-w-0 flex-col gap-0.5 rounded-xl border-2 p-2.5 text-left sm:gap-1 sm:p-3 ${on ? "border-brand bg-[#F1F8F5]" : c.running === 0 ? "border-[#E8C98A] bg-[#FDF6E7]" : "border-line bg-white"}`}
              >
                <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <span className="text-sm font-bold text-ink">{c.name}</span>
                  {c.running === 0 ? <Pill tone="a">No ads</Pill> : <Pill tone="g">{c.running} running</Pill>}
                </span>
                <span className="text-[12px] leading-snug text-muted sm:text-[13px]">{c.spend ? `${rm(c.spend)} · ${count(c.leads)} leads${c.leads ? ` · ${cpl(c.spend, c.leads)} each` : ""}` : "No spend in this period"}</span>
                {(() => {
                  const quiet = c.bare.filter((r) => !c.toSell.includes(r));
                  return c.running > 0 && quiet.length > 0 ? (
                    <span className="text-[12px] text-[#8A5300]">
                      No ad for: {quiet.slice(0, 4).join(", ")}{quiet.length > 4 ? ` +${quiet.length - 4} more` : ""}
                    </span>
                  ) : null;
                })()}
                {c.toSell.length > 0 && <span className="text-[12px] font-semibold text-[#A3231B]">No ad, but has departures to sell: {c.toSell.slice(0, 3).join(", ")}{c.toSell.length > 3 ? ` +${c.toSell.length - 3}` : ""}</span>}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="flex items-end gap-2 sm:hidden">
        <Pick id="cd-m" label="Period" value={days} onChange={setDays} options={PERIODS} />
        <button type="button" aria-expanded={filters} onClick={() => setFilters(!filters)} className={`h-10 flex-none rounded-lg border px-3 text-[13px] font-semibold ${filters || activeFilters ? "border-brand bg-[#E6F1EE] text-ink" : "border-[#9AA39E] bg-white text-ink"}`}>
          Filters{activeFilters ? ` (${activeFilters})` : ""}
        </button>
      </div>
      <div className={`${filters ? "grid" : "hidden"} grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-4`}>
        <div className="hidden sm:flex sm:min-w-[150px] sm:flex-1"><Pick id="cd" label="Period" value={days} onChange={setDays} options={PERIODS} /></div>
        <Pick id="cs" label="Show" value={show} onChange={(v) => { setShow(v); setShown(PAGE); }} options={["Active or with spend", "Active only", "Not tagged", "Everything"]} />
        <Pick id="cc" label="Country" value={country} onChange={(v) => { setCountry(v); setShown(PAGE); }} options={["All countries", ...COUNTRIES, "Not tagged"]} />
        <Pick id="cr" label="Run by" value={runBy} onChange={(v) => { setRunBy(v); setShown(PAGE); }} options={["Everyone", ...people]} />
        <div className="flex min-w-0 flex-col gap-1.5 sm:min-w-[200px] sm:flex-[2_1_220px]">
          <label htmlFor="cq" className="text-[13px] font-semibold">
            Search name
          </label>
          <input id="cq" type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="e.g. Korea" className={`${INPUT} w-full`} />
        </div>
      </div>

      {/* Phones: one short block per campaign, under its country and region. */}
      <div className="flex flex-col gap-3 sm:hidden">
        <div className="text-[12px] text-muted">
          {loading ? "Loading…" : `${spanText(range)}. ${count(rows.length)} campaign${rows.length === 1 ? "" : "s"} · ${rm(sum.spend)} · ${count(sum.leads)} leads${sum.leads ? ` · ${cpl(sum.spend, sum.leads)} each` : ""}`}
        </div>
        {phoneSections.map((sec) => (
          <section key={sec.key} className="overflow-hidden rounded-xl border border-line bg-white">
            <h2 className={`m-0 flex items-baseline justify-between gap-2 px-3 py-2 text-[13px] font-bold ${sec.country ? "bg-ground text-ink" : "bg-[#FBEFD5] text-[#5C3900]"}`}>
              <span>{sec.country ?? "Not matched to a destination"}</span>
              <span className="text-[12px] font-normal text-muted">{sec.running} running · {rm(sec.spend)}</span>
            </h2>
            {sec.regions.map((reg) => (
              <div key={reg.key}>
                {sec.country && (
                  <div className="flex items-baseline justify-between gap-2 border-t border-line px-3 pb-0.5 pt-2 text-[12px]">
                    <span className="font-bold text-brand">{reg.name}</span>
                    <span className="text-muted">{reg.items.length} campaign{reg.items.length === 1 ? "" : "s"}{reg.leads ? ` · ${cpl(reg.spend, reg.leads)} a lead` : ""}</span>
                  </div>
                )}
                <ul className="m-0 list-none divide-y divide-line p-0">
                  {reg.items.map((c) => {
                    const d = delivery(c.delivery_status);
                    const editing = edit?.id === c.id;
                    return (
                      <li key={c.id} className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <Link to={`/campaigns/${c.id}`} className="min-w-0 flex-1 break-words text-sm font-bold leading-snug no-underline">{c.name}</Link>
                          <Pill tone={d.tone}>{d.text}</Pill>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                          <span>{c.spend ? <b className="text-ink">{rm(c.spend)}</b> : "No spend"}</span>
                          {c.leads ? <span><b className="text-ink">{count(c.leads)}</b> leads · <b className="text-ink">{cpl(c.spend, c.leads)}</b> each</span> : c.spend ? <span>no leads</span> : null}
                          {c.daily_budget ? <span>RM{c.daily_budget}/day</span> : null}
                          {c.run_by ? <span>by {c.run_by}</span> : null}
                        </div>
                        {editing ? (
                          <div className="mt-2 flex flex-col gap-2 rounded-lg bg-[#F1F8F5] px-3 py-3">
                            <DestPicker dests={dests} value={edit.dest} email={user?.email ?? ""} onChange={(id) => setEdit({ ...edit, dest: id })} onCreated={setDests} />
                            <input aria-label="Run by" list="people" value={edit.runBy} onChange={(e) => setEdit({ ...edit, runBy: e.target.value })} placeholder="Run by (staff name)" className={`${INPUT} w-full`} />
                            <div className="flex gap-2">
                              <Btn small disabled={busy} onClick={() => void save(c)}>Save</Btn>
                              <Btn small kind="s" disabled={busy} onClick={() => setEdit(null)}>Cancel</Btn>
                            </div>
                          </div>
                        ) : (
                          !c.destination_id && (
                            <button type="button" onClick={() => setEdit({ id: c.id, dest: "", runBy: c.run_by ?? guessRunBy(c.name) ?? "" })} className="mt-1.5 min-h-[32px] rounded-lg border border-brand bg-brand px-2.5 text-[12px] font-semibold text-white">
                              Set destination
                            </button>
                          )
                        )}
                        {!editing && c.destination_id && (
                          <button type="button" onClick={() => setEdit({ id: c.id, dest: c.destination_id ?? "", runBy: c.run_by ?? guessRunBy(c.name) ?? "" })} className="mt-1 border-0 bg-transparent p-0 text-[12px] font-semibold text-brand underline">
                            Change tag
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        ))}
        {!loading && rows.length === 0 && <div className="rounded-xl border border-line bg-white px-3 py-5 text-sm text-muted">No campaign matches these filters.</div>}
        {rows.length > shown && (
          <Btn kind="s" onClick={() => setShown((n) => n + PAGE)}>
            Show {Math.min(PAGE, rows.length - shown)} more
          </Btn>
        )}
      </div>

      <Card className="hidden !p-2 sm:flex">
        <div className="px-3 pt-2 text-[13px] text-muted">
          {loading ? "Loading…" : `${spanText(range)}. ${count(rows.length)} campaign${rows.length === 1 ? "" : "s"}. Spend ${rm(sum.spend)}, leads ${count(sum.leads)}${sum.leads ? `, CPL ${cpl(sum.spend, sum.leads)}` : ""}.`}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 1020 }}>
            <thead>
              <tr>
                {["Campaign", "Destination", "Run by", "Delivery", "Budget a day", "Spend", "Leads (Meta)", "CPL", ""].map((h, i) => (
                  <th key={i} className={`whitespace-nowrap border-b border-line px-3 py-2.5 text-xs font-semibold text-muted ${i >= 4 && i <= 7 ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map((c, i, arr) => {
                const d = delivery(c.delivery_status);
                const editing = edit?.id === c.id;
                const cell = "border-b border-line px-3 py-3 align-top text-sm";
                const head = i === 0 || (arr[i - 1].country ?? "") !== (c.country ?? "");
                const group = rows.filter((x) => (x.country ?? "") === (c.country ?? ""));
                const subHead = Boolean(c.country) && (head || (arr[i - 1].destination_id ?? "") !== (c.destination_id ?? ""));
                const region = rows.filter((x) => (x.destination_id ?? "") === (c.destination_id ?? "") && (x.country ?? "") === (c.country ?? ""));
                const regionName = !c.destination ? "No region" : c.destination.toLowerCase() === (c.country ?? "").toLowerCase() ? "Whole country" : c.destination.replace(new RegExp(`^${c.country}\\s*[-–:]\\s*`, "i"), "");
                const regionLeads = region.reduce((n, x) => n + x.leads, 0);
                const regionSpent = region.reduce((n, x) => n + x.spend, 0);
                return (
                  <Fragment key={c.id}>
                  {head && (
                    <tr>
                      <td colSpan={9} className="border-b border-line bg-[#F1F4F1] px-3 py-2.5 text-[15px]">
                        <B>{c.country ?? "Not matched to a destination"}</B>{" "}
                        <span className="text-muted">
                          · {count(group.length)} campaign{group.length === 1 ? "" : "s"}, {count(group.filter((x) => x.delivery_status === "ACTIVE").length)} running · {rm(group.reduce((n, x) => n + x.spend, 0))}
                        </span>
                      </td>
                    </tr>
                  )}
                  {subHead && (
                    <tr>
                      <td colSpan={9} className="border-b border-line bg-white px-3 pb-1.5 pt-3 text-[13px]">
                        <span className="font-bold text-brand">{regionName}</span>{" "}
                        <span className="text-muted">
                          · {count(region.length)} campaign{region.length === 1 ? "" : "s"}, {count(region.filter((x) => x.delivery_status === "ACTIVE").length)} running · {rm(regionSpent)}
                          {regionLeads ? ` · ${count(regionLeads)} leads · ${cpl(regionSpent, regionLeads)} each` : ""}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className={cell} style={c.country ? { paddingLeft: 24 } : undefined}>
                      <Link to={`/campaigns/${c.id}`} className="font-bold">{c.name}</Link>
                      <Mini>
                        {c.spend ? rm(c.spend) : "No spend"}
                        {c.leads ? ` · ${count(c.leads)} leads · ${cpl(c.spend, c.leads)} each` : c.spend ? " · no leads" : ""}
                      </Mini>
                    </td>
                    <td className={cell}>
                      {editing ? (
                        <DestPicker dests={dests} value={edit.dest} email={user?.email ?? ""} onChange={(id) => setEdit({ ...edit, dest: id })} onCreated={setDests} />
                      ) : c.destination ? (
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <Pill tone="t">{c.destination}</Pill>
                          {c.destination_manual && <span className="text-xs text-muted">set by hand</span>}
                        </span>
                      ) : (
                        <Pill tone="a">Not matched</Pill>
                      )}
                    </td>
                    <td className={cell}>
                      {editing ? (
                        <input aria-label="Run by" list="people" value={edit.runBy} onChange={(e) => setEdit({ ...edit, runBy: e.target.value })} placeholder="Staff name" className={`${INPUT} w-[140px]`} />
                      ) : c.run_by ? (
                        <RunBy k={c.run_by} />
                      ) : (
                        ""
                      )}
                    </td>
                    <td className={cell}>
                      <Pill tone={d.tone}>{d.text}</Pill>
                    </td>
                    <td className={`${cell} text-right`}>{c.daily_budget ? rm(c.daily_budget) : ""}</td>
                    <td className={`${cell} text-right`}>{c.spend ? rm(c.spend) : ""}</td>
                    <td className={`${cell} text-right`}>{c.leads ? count(c.leads) : ""}</td>
                    <td className={`${cell} text-right`}>{cpl(c.spend, c.leads)}</td>
                    <td className={`${cell} whitespace-nowrap`}>
                      {editing ? (
                        <span className="inline-flex gap-1.5">
                          <Btn small disabled={busy} onClick={() => void save(c)}>
                            Save
                          </Btn>
                          <Btn small kind="s" disabled={busy} onClick={() => setEdit(null)}>
                            Cancel
                          </Btn>
                        </span>
                      ) : (
                        <Btn small kind={c.destination_id ? "s" : "p"} onClick={() => setEdit({ id: c.id, dest: c.destination_id ?? "", runBy: c.run_by ?? guessRunBy(c.name) ?? "" })}>
                          {c.destination_id ? "Change" : "Set"}
                        </Btn>
                      )}
                    </td>
                  </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <datalist id="people">
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        {!loading && rows.length === 0 && <div className="px-3 py-6 text-sm text-muted">No campaign matches these filters.</div>}
        {rows.length > shown && (
          <div className="p-3">
            <Btn kind="s" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, rows.length - shown)} more
            </Btn>
          </div>
        )}
      </Card>

      <p className="m-0 text-[13px] text-muted">
        Destination and Run by are read from the campaign name, using the list in Settings, Destinations. Leads are the leads Meta counts. Meta is
        checked every hour.
      </p>
    </>
  );
}
