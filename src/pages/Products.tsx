import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { B, Btn, Card, PageHead, Pill, Stat } from "../components/ui";
import { DestPicker } from "../components/DestPicker";
import { useAuth } from "../lib/auth";
import { useStore } from "../lib/store";
import { type Departure, type Destination, count, fetchDepartures, fetchDestinations, tagPackage, when } from "../lib/live";

const INPUT = "min-h-[40px] sm:min-h-[44px] rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";
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
  const [country, setCountry] = useState("");
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
      .filter((g) => !country || g.country === country)
      .map((g) => ({ ...g, list: g.list.sort((a, b) => (a.departure_date ?? "").localeCompare(b.departure_date ?? "")) }))
      .sort((a, b) => Number(a.matched) - Number(b.matched) || a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
  }, [deps, dests, country, past, today]);

  const all = groups.flatMap((g) => g.list);
  const lowSeats = all.filter((d) => d.seats_available != null && d.seats_available <= 5).length;
  const lastLoad = deps.reduce((m, d) => (d.updated_at > m ? d.updated_at : m), "");
  const countries = Array.from(new Set(deps.map((d) => dests.find((x) => x.id === d.destination_id)?.country ?? d.country ?? "Unknown"))).sort();
  const figures = (g: Group) => {
    const dated = g.list.filter((d) => d.departure_date);
    return {
      dated,
      seats: g.list.reduce((n, d) => n + (d.seats_available ?? 0), 0),
      taken: g.list.reduce((n, d) => n + (pax.get(d.departure_id) ?? 0), 0),
      low: g.list.filter((d) => d.seats_available != null && d.seats_available <= 5).length,
      span: dated.length ? (dated.length === 1 ? day(dated[0].departure_date) : `${day(dated[0].departure_date, false)} – ${day(dated[dated.length - 1].departure_date)}`) : "No dates",
    };
  };
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
  const datesPanel = (g: Group) => (
    <>
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {g.list.map((d) => {
          const st = d.seats_available;
          const tone = st === 0 ? "bg-[#ECEFEC] text-muted" : st != null && st <= 5 ? "bg-[#FBEFD5] text-[#5C3900]" : "bg-white text-ink";
          return (
            <span key={d.departure_id} className={`rounded-lg border border-line px-2 py-1 text-[12px] sm:px-2.5 sm:py-1.5 sm:text-[13px] ${tone}`}>
              <B>{day(d.departure_date)}</B> · {st == null ? "seats ?" : st === 0 ? "full" : `${st} left`}
              {pax.get(d.departure_id) ? ` · ${pax.get(d.departure_id)} pax` : ""}
            </span>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-muted">In TravelCRM: {g.packages.join(" · ")}</div>
      {!g.matched && (
        <div className="mt-1 text-xs">
          <Link to="/settings/destinations" className="font-semibold">Add a word for it in Settings, Destinations</Link> so it counts with its campaigns.
        </div>
      )}
    </>
  );
  // On a phone: one short block per product, under its country.
  const sections = groups.reduce<{ head: string; items: Group[] }[]>((out, g) => {
    const head = g.matched ? g.country : "No destination yet";
    const last = out[out.length - 1];
    if (last && last.head === head) last.items.push(g);
    else out.push({ head, items: [g] });
    return out;
  }, []);

  const th = "whitespace-nowrap border-b border-line px-3 py-2.5 text-xs font-semibold text-muted";
  const td = "border-b border-line px-3 py-2.5 text-sm align-middle";

  return (
    <>
      <PageHead title="Products" sub="Step 1. Packages from TravelCRM by destination: when they depart, seats left and deposits taken." />

      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-4">
        <Stat label="Products" value={loading ? "…" : count(groups.length)} sub="destinations" />
        <Stat label="Departures" value={loading ? "…" : count(all.length)} sub={past ? "including past" : "upcoming"} />
        <Stat label="Nearly full" value={loading ? "…" : count(lowSeats)} sub="5 seats or fewer" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Country" value={country} onChange={(e) => setCountry(e.target.value)} className={INPUT}>
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="flex min-h-[36px] sm:min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} className="h-5 w-5" />
          Show past departures
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:hidden">
        {sections.map((sec) => (
          <section key={sec.head} className="overflow-hidden rounded-xl border border-line bg-white">
            <h2 className={`m-0 flex items-baseline justify-between px-3 py-2 text-[13px] font-bold ${sec.head === "No destination yet" ? "bg-[#FBEFD5] text-[#5C3900]" : "bg-ground text-ink"}`}>
              {sec.head}
              <span className="text-[12px] font-normal text-muted">{sec.items.length} product{sec.items.length === 1 ? "" : "s"}</span>
            </h2>
            <ul className="m-0 list-none divide-y divide-line p-0">
              {sec.items.map((g) => {
                const f = figures(g);
                const isOpen = Boolean(open[g.key]);
                const short = g.matched && g.name.toLowerCase().startsWith(`${g.country.toLowerCase()} - `) ? g.name.slice(g.country.length + 3) : g.name;
                return (
                  <li key={g.key} className="px-3 py-2.5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-sm font-bold leading-snug">{short}</div>
                        <div className="mt-0.5 text-[12px] text-muted">
                          {f.span} · {count(g.list.length)} date{g.list.length === 1 ? "" : "s"}
                          {f.taken ? <> · <span className="font-semibold text-ink">{count(f.taken)} deposit pax</span></> : ""}
                        </div>
                      </div>
                      <div className="flex-none text-right">
                        <div className="text-[15px] font-bold leading-tight">{count(f.seats)}</div>
                        <div className="text-[11px] text-muted">seats left</div>
                        {f.low > 0 && <div className="text-[11px] font-semibold text-[#8A5300]">{f.low} nearly full</div>}
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <button type="button" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))} className="min-h-[32px] rounded-lg border border-line bg-white px-2.5 text-[12px] font-semibold text-ink">
                        {isOpen ? "Hide dates" : "Dates"}
                      </button>
                      <button type="button" aria-expanded={tag?.key === g.key} onClick={() => toggleTag(g)} className={`min-h-[32px] rounded-lg border px-2.5 text-[12px] font-semibold ${g.matched ? "border-line bg-white text-ink" : "border-brand bg-brand text-white"}`}>
                        {g.matched ? "Change destination" : "Set destination"}
                      </button>
                    </div>
                    {tag?.key === g.key && <div className="mt-2 rounded-lg bg-[#F1F8F5] px-3 py-3">{tagPanel(g)}</div>}
                    {isOpen && <div className="mt-2 rounded-lg bg-ground px-2.5 py-2.5">{datesPanel(g)}</div>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {!loading && groups.length === 0 && <div className="rounded-xl border border-line bg-white px-3 py-5 text-sm text-muted">Nothing loaded for this view. Departures appear after the nightly TravelCRM load (00:45).</div>}
      </div>

      <Card className="hidden !p-2 sm:flex">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th className={`${th} text-left`}>Product</th>
                <th className={`${th} text-left`}>Departures from</th>
                <th className={`${th} text-left`}>Until</th>
                <th className={`${th} text-right`}>Dates</th>
                <th className={`${th} text-right`}>Seats left</th>
                <th className={`${th} text-right`}>Deposit pax</th>
                <th className={`${th} text-left`} />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const { dated, seats, taken, low } = figures(g);
                const isOpen = Boolean(open[g.key]);
                return (
                  <Fragment key={g.key}>
                    <tr>
                      <td className={td}>
                        <B>{g.name}</B>
                        {!g.matched && (
                          <span className="ml-2">
                            <Pill tone="a">No destination</Pill>
                          </span>
                        )}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{dated.length ? day(dated[0].departure_date) : ""}</td>
                      <td className={`${td} whitespace-nowrap`}>{dated.length ? day(dated[dated.length - 1].departure_date) : ""}</td>
                      <td className={`${td} text-right`}>{count(g.list.length)}</td>
                      <td className={`${td} text-right`}>
                        {count(seats)}
                        {low > 0 && <span className="ml-2 text-[12px] font-semibold text-[#8A5300]">{low} nearly full</span>}
                      </td>
                      <td className={`${td} text-right`}>{taken ? count(taken) : ""}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        <Btn small kind={g.matched ? "s" : "p"} className="mr-1.5" onClick={() => toggleTag(g)}>
                          {g.matched ? "Change" : "Set destination"}
                        </Btn>
                        <button type="button" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))} className="min-h-[36px] sm:min-h-[44px] whitespace-nowrap rounded-lg border border-[#9AA39E] bg-white px-3 text-[13px] font-semibold">
                          {isOpen ? "Hide dates" : "Show dates"}
                        </button>
                      </td>
                    </tr>
                    {tag?.key === g.key && (
                      <tr>
                        <td colSpan={7} className="border-b border-line bg-[#F1F8F5] px-3 py-3">
                          <div className="sticky left-3" style={{ width: "min(420px, calc(100vw - 64px))" }}>{tagPanel(g)}</div>
                        </td>
                      </tr>
                    )}
                    {isOpen && (
                      <tr>
                        <td colSpan={7} className="border-b border-line bg-ground px-3 py-3">
                          {datesPanel(g)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && groups.length === 0 && <div className="px-3 py-5 text-sm text-muted">Nothing loaded for this view. Departures appear after the nightly TravelCRM load (00:45).</div>}
      </Card>

      <p className="m-0 text-[13px] text-muted">
        Packages for the same destination are shown as one product, across years. This is not the full TravelCRM catalogue: it holds the departures that
        had a closed booking in the days loaded so far. Seats are as at the last load ({lastLoad ? when(lastLoad) : "never"}). Deposit pax counts loaded
        bookings only.
      </p>
    </>
  );
}
