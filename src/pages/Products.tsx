import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { B, Card, PageHead, Pill, Stat } from "../components/ui";
import { type Departure, type Destination, count, fetchDepartures, fetchDestinations, when } from "../lib/live";

const INPUT = "min-h-[44px] rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";
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
      .sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
  }, [deps, dests, country, past, today]);

  const all = groups.flatMap((g) => g.list);
  const lowSeats = all.filter((d) => d.seats_available != null && d.seats_available <= 5).length;
  const lastLoad = deps.reduce((m, d) => (d.updated_at > m ? d.updated_at : m), "");
  const countries = Array.from(new Set(deps.map((d) => dests.find((x) => x.id === d.destination_id)?.country ?? d.country ?? "Unknown"))).sort();
  const th = "whitespace-nowrap border-b border-line px-3 py-2.5 text-xs font-semibold text-muted";
  const td = "border-b border-line px-3 py-2.5 text-sm align-middle";

  return (
    <>
      <PageHead title="Products" sub="Step 1. Packages from TravelCRM by destination: when they depart, seats left and deposits taken." />

      <div className="flex flex-wrap gap-4">
        <Stat label="Products" value={loading ? "…" : count(groups.length)} sub="destinations with departures" />
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
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} className="h-5 w-5" />
          Show past departures
        </label>
      </div>

      <Card className="!p-2">
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
                const dated = g.list.filter((d) => d.departure_date);
                const seats = g.list.reduce((n, d) => n + (d.seats_available ?? 0), 0);
                const taken = g.list.reduce((n, d) => n + (pax.get(d.departure_id) ?? 0), 0);
                const low = g.list.filter((d) => d.seats_available != null && d.seats_available <= 5).length;
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
                      <td className={td}>
                        <button type="button" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))} className="min-h-[44px] whitespace-nowrap rounded-lg border border-[#9AA39E] bg-white px-3 text-[13px] font-semibold">
                          {isOpen ? "Hide dates" : "Show dates"}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} className="border-b border-line bg-ground px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            {g.list.map((d) => {
                              const s = d.seats_available;
                              const tone = s === 0 ? "bg-[#ECEFEC] text-muted" : s != null && s <= 5 ? "bg-[#FBEFD5] text-[#5C3900]" : "bg-white text-ink";
                              return (
                                <span key={d.departure_id} className={`rounded-lg border border-line px-2.5 py-1.5 text-[13px] ${tone}`}>
                                  <B>{day(d.departure_date)}</B> · {s == null ? "seats ?" : s === 0 ? "full" : `${s} left`}
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
