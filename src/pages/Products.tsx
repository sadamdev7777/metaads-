import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { B, Btn, Card, PageHead, Pill, Stat } from "../components/ui";
import { DestPicker } from "../components/DestPicker";
import { useAuth } from "../lib/auth";
import { useStore } from "../lib/store";
import { type Departure, type Destination, count, fetchDepartures, fetchDestinations, tagPackage, when } from "../lib/live";

const day = (iso: string | null, year = true) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-MY", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) }) : "No date";
/** "01. SABAH - KK KUNDASANG 2026" and "01. DOMESTIK - KK & KUNDASANG 2027" are the same product in different years. */
const cleanName = (n: string | null) => (n ?? "Unnamed package").replace(/^\s*\d+\.\s*/, "").replace(/\s*\b20\d\d\b\s*$/, "").trim();

type Group = { key: string; name: string; country: string; matched: boolean; packages: string[]; list: Departure[] };

export default function Products() {
  const [deps, setDeps] = useState<Departure[]>([]);
  const [pax, setPax] = useState<Map<number, number>>(new Map());
  const [dests, setDests] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [past, setPast] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { user } = useAuth();
  const { act } = useStore();
  const [tag, setTag] = useState<{ key: string; dest: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () =>
    fetchDepartures().then((r) => {
      setDeps(r.departures);
      setPax(r.pax);
      setLoading(false);
    });
  async function saveTagFor(g: Group) {
    const dest = dests.find((d) => d.id === tag?.dest);
    if (!dest) return;
    setBusy(true);
    let err: string | null = null;
    for (const p of g.packages) err = (await tagPackage(p, dest.id)) ?? err;
    setBusy(false);
    act(`Set ${g.packages.length === 1 ? g.packages[0] : `${g.packages.length} packages of ${g.name}`} to ${dest.name}${err ? " (failed)" : ""}`, "Products", err ?? `Saved. ${g.name} now counts under ${dest.name}, and so will its later departures.`);
    if (!err) {
      setTag(null);
      await load();
    }
  }
  useEffect(() => {
    void fetchDepartures().then((r) => {
      setDeps(r.departures);
      setPax(r.pax);
      setLoading(false);
    });
    void fetchDestinations().then(setDests);
  }, []);

  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const countryOf = (d: Departure) => dests.find((x) => x.id === d.destination_id)?.country ?? d.country ?? "Unknown";
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const d of deps) {
      if (!past && d.departure_date && d.departure_date < today) continue;
      const dest = dests.find((x) => x.id === d.destination_id);
      const key = dest ? dest.id : `p:${cleanName(d.package_name).toLowerCase()}`;
      const g = map.get(key) ?? { key, name: dest?.name ?? cleanName(d.package_name), country: dest?.country ?? d.country ?? "Unknown", matched: Boolean(dest), packages: [], list: [] };
      g.list.push(d);
      if (d.package_name && !g.packages.includes(d.package_name)) g.packages.push(d.package_name);
      map.set(key, g);
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, list: g.list.sort((a, b) => (a.departure_date ?? "").localeCompare(b.departure_date ?? "")) }))
      .sort((a, b) => (a.list[0]?.departure_date ?? "9").localeCompare(b.list[0]?.departure_date ?? "9") || a.name.localeCompare(b.name));
  }, [deps, dests, past, today]);

  const figures = (list: Departure[]) => {
    const dated = list.filter((d) => d.departure_date);
    return {
      seats: list.reduce((n, d) => n + (d.seats_available ?? 0), 0),
      known: list.some((d) => d.seats_available != null),
      taken: list.reduce((n, d) => n + (pax.get(d.departure_id) ?? 0), 0),
      low: list.filter((d) => d.seats_available != null && d.seats_available > 0 && d.seats_available <= 5).length,
      next: dated[0]?.departure_date ?? null,
    };
  };
  // Countries, busiest first; "Unknown" last.
  const countries = useMemo(() => {
    const map = new Map<string, Group[]>();
    for (const g of groups) map.set(g.country, [...(map.get(g.country) ?? []), g]);
    return Array.from(map.entries())
      .map(([name, items]) => ({ name, items, list: items.flatMap((g) => g.list) }))
      .sort((a, b) => Number(a.name === "Unknown") - Number(b.name === "Unknown") || b.list.length - a.list.length || a.name.localeCompare(b.name));
  }, [groups]);

  const all = groups.flatMap((g) => g.list);
  const lowSeats = all.filter((d) => d.seats_available != null && d.seats_available > 0 && d.seats_available <= 5).length;
  const lastSeats = deps.reduce((m, d) => (d.seats_checked_at && d.seats_checked_at > m ? d.seats_checked_at : m), "");
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const toggleTag = (g: Group) => setTag(tag?.key === g.key ? null : { key: g.key, dest: g.matched ? g.key : "" });
  const tagPanel = (g: Group) => (
    <div className="flex flex-col gap-2">
      <div className="text-sm">
        <B>Where does this product belong?</B> Choose the country, then the region. A region that is not on the list can be added here.
      </div>
      <div className="text-[13px] text-muted">{g.packages.join(" · ")}</div>
      <DestPicker dests={dests} value={tag?.dest ?? ""} email={user?.email ?? ""} onChange={(id) => setTag({ key: g.key, dest: id })} onCreated={setDests} />
      <div className="flex gap-2">
        <Btn small disabled={busy || !tag?.dest} onClick={() => void saveTagFor(g)}>
          {busy ? "Saving…" : "Save"}
        </Btn>
        <Btn small kind="s" disabled={busy} onClick={() => setTag(null)}>
          Cancel
        </Btn>
      </div>
    </div>
  );
  const rm = (n: number | null | undefined) => (n == null ? "" : `RM${Math.round(n).toLocaleString("en-MY")}`);
  const datesPanel = (g: Group) => (
    <>
      <ul className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {g.list.map((d) => {
          const st = d.seats_available;
          const full = st === 0;
          const low = st != null && st > 0 && st <= 5;
          const closed = d.booking_deadline && d.booking_deadline < today;
          return (
            <li key={d.departure_id} className={`flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-2 text-[13px] ${full ? "bg-[#ECEFEC] text-muted" : low ? "bg-[#FBEFD5]" : "bg-white"}`}>
              <div className="min-w-0">
                <div className="font-bold">{day(d.departure_date)}{d.return_date ? <span className="font-normal text-muted"> – {day(d.return_date, false)}</span> : ""}</div>
                <div className="text-[12px] text-muted">
                  {[rm(d.price_from) && `from ${rm(d.price_from)}`, d.booking_deadline && `${closed ? "closed" : "book by"} ${day(d.booking_deadline, false)}`, pax.get(d.departure_id) ? `${pax.get(d.departure_id)} deposit pax` : ""].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className={`flex-none text-right text-[13px] font-bold ${low ? "text-[#8A5300]" : ""}`}>{st == null ? <span className="font-normal text-muted">seats ?</span> : full ? "Full" : `${st} left`}</div>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 text-xs text-muted">In TravelCRM: {g.packages.join(" · ")}</div>
    </>
  );
  const nums = (f: ReturnType<typeof figures>, dates: number) => (
    <div className="flex-none text-right">
      <div className="text-[15px] font-bold leading-tight">{f.known ? count(f.seats) : "–"}</div>
      <div className="text-[11px] text-muted">seats left · {count(dates)} date{dates === 1 ? "" : "s"}</div>
      {f.low > 0 && <div className="text-[11px] font-semibold text-[#8A5300]">{f.low} nearly full</div>}
    </div>
  );
  const chevron = (isOpen: boolean) => (
    <svg aria-hidden viewBox="0 0 20 20" className={`h-4 w-4 flex-none text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
  );

  return (
    <>
      <PageHead title="Products" sub="Step 1. Choose a country to see its packages, then a package to see its dates, seats left and deposits." />

      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-4">
        <Stat label="Countries" value={loading ? "…" : count(countries.length)} sub="with departures" />
        <Stat label="Departures" value={loading ? "…" : count(all.length)} sub={past ? "including past" : "upcoming"} />
        <Stat label="Nearly full" value={loading ? "…" : count(lowSeats)} sub="1 to 5 seats left" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-[36px] items-center gap-2 text-sm">
          <input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} className="h-5 w-5" />
          Show past departures
        </label>
        <button type="button" onClick={() => setOpen({})} className="min-h-[36px] text-sm font-semibold text-brand">Close all</button>
      </div>

      <div className="flex flex-col gap-2">
        {countries.map((c) => {
          const cOpen = Boolean(open[`c:${c.name}`]);
          const cf = figures(c.list);
          return (
            <section key={c.name} className="overflow-hidden rounded-xl border border-line bg-white">
              <button type="button" aria-expanded={cOpen} onClick={() => toggle(`c:${c.name}`)} className="flex w-full items-center gap-3 px-3 py-3 text-left sm:px-4">
                {chevron(cOpen)}
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold sm:text-base">{c.name}</div>
                  <div className="text-[12px] text-muted">
                    {count(c.items.length)} package{c.items.length === 1 ? "" : "s"}
                    {cf.next ? ` · next ${day(cf.next, false)}` : ""}
                    {cf.taken ? <> · <span className="font-semibold text-ink">{count(cf.taken)} deposit pax</span></> : ""}
                  </div>
                </div>
                {nums(cf, c.list.length)}
              </button>
              {cOpen && (
                <ul className="m-0 list-none divide-y divide-line border-t border-line bg-ground p-0">
                  {c.items.map((g) => {
                    const pOpen = Boolean(open[g.key]);
                    const f = figures(g.list);
                    const short = g.name.toLowerCase().startsWith(`${g.country.toLowerCase()} - `) ? g.name.slice(g.country.length + 3) : g.name;
                    return (
                      <li key={g.key}>
                        <div className="flex items-center gap-3 px-3 py-2.5 pl-6 sm:px-4 sm:pl-10">
                          <button type="button" aria-expanded={pOpen} onClick={() => toggle(g.key)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                            {chevron(pOpen)}
                            <div className="min-w-0 flex-1">
                              <div className="break-words text-sm font-bold leading-snug">
                                {short}
                                {!g.matched && <span className="ml-2 align-middle"><Pill tone="a">No destination</Pill></span>}
                              </div>
                              <div className="text-[12px] text-muted">
                                {f.next ? `next ${day(f.next, false)}` : "no dates"}
                                {f.taken ? <> · <span className="font-semibold text-ink">{count(f.taken)} deposit pax</span></> : ""}
                              </div>
                            </div>
                            {nums(f, g.list.length)}
                          </button>
                        </div>
                        {pOpen && (
                          <div className="px-3 pb-3 pl-6 sm:px-4 sm:pl-10">
                            {datesPanel(g)}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Btn small kind={g.matched ? "s" : "p"} onClick={() => toggleTag(g)}>{g.matched ? "Change destination" : "Set destination"}</Btn>
                              {!g.matched && <Link to="/settings/destinations" className="text-xs font-semibold">or add a word in Settings, Destinations</Link>}
                            </div>
                            {tag?.key === g.key && <div className="mt-2 rounded-lg bg-[#F1F8F5] px-3 py-3">{tagPanel(g)}</div>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        {!loading && countries.length === 0 && <div className="rounded-xl border border-line bg-white px-3 py-5 text-sm text-muted">Nothing loaded yet. Departures and seats come from TravelCRM every night at 02:17.</div>}
      </div>

      <p className="m-0 text-[13px] text-muted">
        Every upcoming TravelCRM departure for the next 12 months is loaded each night at 02:17, with seats for the next 9 months. Seats as at{" "}
        {lastSeats ? when(lastSeats) : "the first full load (tonight)"}. Packages for the same destination are shown as one product, across years.
      </p>
    </>
  );
}
