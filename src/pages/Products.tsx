import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { B, Card, PageHead, Pill, Stat, T } from "../components/ui";
import { type Departure, type Destination, count, fetchDepartures, fetchDestinations, when } from "../lib/live";

const INPUT = "min-h-[44px] rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";
const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "No date");

export default function Products() {
  const [deps, setDeps] = useState<Departure[]>([]);
  const [pax, setPax] = useState<Map<number, number>>(new Map());
  const [dests, setDests] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [past, setPast] = useState(false);
  useEffect(() => {
    void fetchDepartures().then((r) => {
      setDeps(r.departures);
      setPax(r.pax);
      setLoading(false);
    });
    void fetchDestinations().then(setDests);
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const destName = (id: string | null) => dests.find((d) => d.id === id)?.name ?? null;
  const groups = useMemo(() => {
    const map = new Map<string, Departure[]>();
    for (const d of deps) {
      if (!past && d.departure_date && d.departure_date < today) continue;
      if (filter && d.destination_id !== filter) continue;
      const key = d.package_name ?? "Unnamed package";
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [deps, filter, past, today]);
  const upcoming = deps.filter((d) => !d.departure_date || d.departure_date >= today);
  const lowSeats = upcoming.filter((d) => d.seats_available != null && d.seats_available <= 5).length;
  const lastLoad = deps.reduce((m, d) => (d.updated_at > m ? d.updated_at : m), "");

  return (
    <>
      <PageHead title="Products" sub="Step 1. Packages and departure dates from TravelCRM, with seats left and deposits taken." />

      <div className="rounded-xl bg-[#FBEFD5] px-5 py-4 text-sm">
        <B>This is not the full TravelCRM catalogue yet.</B> It shows only the departures that had a closed booking in the days loaded so far. Packages
        with no recent booking are missing. Seats are as they were at the last load ({lastLoad ? when(lastLoad) : "never"}).
      </div>

      <div className="flex flex-wrap gap-4">
        <Stat label="Packages" value={loading ? "…" : count(new Set(upcoming.map((d) => d.package_name)).size)} sub="with upcoming dates" />
        <Stat label="Upcoming departures" value={loading ? "…" : count(upcoming.length)} sub="loaded so far" />
        <Stat label="5 seats or fewer" value={loading ? "…" : count(lowSeats)} sub="nearly full" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Destination" value={filter} onChange={(e) => setFilter(e.target.value)} className={INPUT}>
          <option value="">All destinations</option>
          {dests.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} className="h-5 w-5" />
          Show past departures
        </label>
      </div>

      {!loading && groups.length === 0 && (
        <Card title="Nothing loaded for this view">
          <div className="text-sm">Departures appear here after the nightly TravelCRM load (00:45).</div>
        </Card>
      )}

      {groups.map(([name, list]) => {
        const dest = destName(list[0].destination_id);
        return (
          <Card key={name} title={name} right={dest ? <Pill tone="t">{dest}</Pill> : <Pill tone="a">No destination</Pill>}>
            <T
              minW={520}
              right={[1, 2]}
              heads={["Departure", "Seats left", "Deposit pax (loaded)", ""]}
              rows={list.map((d) => [
                day(d.departure_date),
                d.seats_available == null ? "" : count(d.seats_available),
                pax.get(d.departure_id) ? count(pax.get(d.departure_id)!) : "",
                d.seats_available === 0 ? <Pill tone="n">Full</Pill> : d.seats_available != null && d.seats_available <= 5 ? <Pill tone="a">Nearly full</Pill> : "",
              ])}
            />
            {!dest && (
              <div className="text-[13px] text-muted">
                Not matched to a destination.{" "}
                <Link to="/settings/destinations" className="font-semibold">Add a word for it in Settings, Destinations</Link>
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}
