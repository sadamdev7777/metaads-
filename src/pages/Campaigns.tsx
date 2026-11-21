import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { B, Btn, Card, PageHead, Pill, RunBy, Mini } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useEffect } from "react";
import { type CampaignRow, type Destination, count, cpl, delivery, PERIODS, fetchDestinations, guessRunBy, period, rm, saveTag, syncNow, useCampaignsIn, useMonthTotals, when, spanText } from "../lib/live";
import { useStore } from "../lib/store";

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
  useEffect(() => {
    void fetchDestinations().then(setDests);
  }, []);
  const COUNTRIES = useMemo(() => Array.from(new Set(dests.map((d) => d.country))).sort(), [dests]);
  const [busy, setBusy] = useState(false);

  const people = useMemo(() => Array.from(new Set(data.map((c) => c.run_by).filter(Boolean) as string[])).sort(), [data]);
  const rows = useMemo(() => {
    const text = q.trim().toLowerCase();
    return data.filter((c) => {
      if (show === "Active or with spend" && !(c.delivery_status === "ACTIVE" || c.spend > 0)) return false;
      if (show === "Active only" && c.delivery_status !== "ACTIVE") return false;
      if (show === "Not tagged" && c.destination_id) return false;
      if (country !== "All countries" && (country === "Not tagged" ? Boolean(c.country) : c.country !== country)) return false;
      if (runBy !== "Everyone" && c.run_by !== runBy) return false;
      return !text || c.name.toLowerCase().includes(text);
    });
  }, [data, show, country, runBy, q]);

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
              {rows.slice(0, shown).map((c) => {
                const d = delivery(c.delivery_status);
                const editing = edit?.id === c.id;
                const cell = "border-b border-line px-3 py-3 align-top text-sm";
                return (
                  <tr key={c.id}>
                    <td className={cell}>
                      <Link to={`/campaigns/${c.id}`} className="font-bold">{c.name}</Link>
                      <Mini>
                        {c.spend ? rm(c.spend) : "No spend"}
                        {c.leads ? ` · ${count(c.leads)} leads · ${cpl(c.spend, c.leads)} each` : c.spend ? " · no leads" : ""}
                      </Mini>
                    </td>
                    <td className={cell}>
                      {editing ? (
                        <select aria-label="Destination" value={edit.dest} onChange={(e) => setEdit({ ...edit, dest: e.target.value })} className={INPUT}>
                          <option value="">No destination</option>
                          {dests.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
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
