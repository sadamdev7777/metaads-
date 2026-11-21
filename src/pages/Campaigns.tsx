import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { B, Btn, Card, PageHead, Pill, RunBy, Mini } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useEffect } from "react";
import { type CampaignRow, type Destination, count, cpl, delivery, PERIODS, fetchDepartures, fetchDestinations, guessRunBy, period, rm, saveTag, syncNow, useCampaignsIn, useMonthTotals, when, spanText } from "../lib/live";
import { useStore } from "../lib/store";
import { DestPicker } from "../components/DestPicker";

const INPUT = "min-h-[44px] rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";
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
    return [...kept].sort((a, b) => Number(Boolean(a.country)) - Number(Boolean(b.country)) || (spendOf.get(b.country ?? "") ?? 0) - (spendOf.get(a.country ?? "") ?? 0) || (a.country ?? "").localeCompare(b.country ?? "") || b.spend - a.spend);
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
            <Link to="/campaigns/new" className="flex min-h-[44px] items-center rounded-lg bg-brand px-4 text-sm font-bold text-white no-underline">
              New campaign
            </Link>
          </div>
        }
      />

      {error && <div className="rounded-xl bg-[#FBE6E3] px-5 py-4 text-sm text-[#A3231B]">Could not load campaigns: {error}</div>}

      {untagged.length > 0 && (
        <div className="flex flex-wrap items-center gap-3.5 rounded-xl bg-[#FBEFD5] px-5 py-4">
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
            <Link to="/settings/destinations" className="flex min-h-[44px] items-center rounded-lg bg-brand px-4 text-sm font-bold text-white no-underline">
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
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
          {byCountry.map((c) => {
            const on = country === c.name;
            return (
              <button
                key={c.name}
                type="button"
                aria-pressed={on}
                onClick={() => { setCountry(on ? "All countries" : c.name); if (!on && c.running === 0) setShow("Everything"); setShown(PAGE); }}
                className={`flex min-w-0 flex-col gap-1 rounded-xl border-2 p-3 text-left ${on ? "border-brand bg-[#F1F8F5]" : c.running === 0 ? "border-[#E8C98A] bg-[#FDF6E7]" : "border-line bg-white"}`}
              >
                <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <span className="text-sm font-bold text-ink">{c.name}</span>
                  {c.running === 0 ? <Pill tone="a">No ads</Pill> : <Pill tone="g">{c.running} running</Pill>}
                </span>
                <span className="text-[13px] text-muted">{c.spend ? `${rm(c.spend)} · ${count(c.leads)} leads${c.leads ? ` · ${cpl(c.spend, c.leads)} each` : ""}` : "No spend in this period"}</span>
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

      <div className="flex flex-wrap items-end gap-4">
        <Pick id="cd" label="Period" value={days} onChange={setDays} options={PERIODS} />
        <Pick id="cs" label="Show" value={show} onChange={(v) => { setShow(v); setShown(PAGE); }} options={["Active or with spend", "Active only", "Not tagged", "Everything"]} />
        <Pick id="cc" label="Country" value={country} onChange={(v) => { setCountry(v); setShown(PAGE); }} options={["All countries", ...COUNTRIES, "Not tagged"]} />
        <Pick id="cr" label="Run by" value={runBy} onChange={(v) => { setRunBy(v); setShown(PAGE); }} options={["Everyone", ...people]} />
        <div className="flex min-w-[200px] flex-[2_1_220px] flex-col gap-1.5">
          <label htmlFor="cq" className="text-[13px] font-semibold">
            Search name
          </label>
          <input id="cq" type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="e.g. Korea" className={`${INPUT} w-full`} />
        </div>
      </div>

      <Card className="!p-2">
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
                return (
                  <Fragment key={c.id}>
                  {head && (
                    <tr>
                      <td colSpan={9} className="border-b border-line bg-[#F1F4F1] px-3 py-2 text-sm">
                        <B>{c.country ?? "Not matched to a destination"}</B>{" "}
                        <span className="text-muted">
                          · {count(group.length)} campaign{group.length === 1 ? "" : "s"}, {count(group.filter((x) => x.delivery_status === "ACTIVE").length)} running · {rm(group.reduce((n, x) => n + x.spend, 0))}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className={cell}>
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
