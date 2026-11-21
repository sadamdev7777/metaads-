import { useEffect, useMemo, useState } from "react";
import { Btn } from "./ui";
import { COUNTRIES, type Destination, fetchDestinations, saveDestination } from "../lib/live";

const INPUT = "min-h-[44px] w-full rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";
const NEW = "__new";
/** "China - Yunnan" shows as "Yunnan" under China; a destination named like its country is the whole country. */
const regionOf = (d: Destination) => (d.name.toLowerCase() === d.country.toLowerCase() ? "Whole country" : d.name.replace(new RegExp(`^${d.country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-–:]\\s*`, "i"), ""));

/**
 * Pick a destination in two steps: the country, then the region inside it. A country or a region that is
 * not on the list yet can be created on the spot; it is added to Settings, Destinations.
 */
export function DestPicker({ dests, value, email, onChange, onCreated }: { dests: Destination[]; value: string; email: string; onChange: (id: string) => void; onCreated: (list: Destination[]) => void }) {
  const current = dests.find((d) => d.id === value);
  const [country, setCountry] = useState(current?.country ?? "");
  const [newCountry, setNewCountry] = useState("");
  const [region, setRegion] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (current) setCountry(current.country);
  }, [current?.id]);

  const countries = useMemo(() => Array.from(new Set([...dests.map((d) => d.country), ...COUNTRIES])).sort(), [dests]);
  const theCountry = country === NEW ? newCountry.trim() : country;
  const regions = dests.filter((d) => d.country === theCountry).sort((a, b) => regionOf(a).localeCompare(regionOf(b)));

  async function create() {
    const r = region.trim();
    if (!theCountry) return setNote("Choose or type the country first.");
    const name = r ? `${theCountry} - ${r}` : theCountry;
    const exists = dests.find((d) => d.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      onChange(exists.id);
      setAdding(false);
      return setNote("");
    }
    setBusy(true);
    const err = await saveDestination({ name, country: theCountry, keywords: [(r || theCountry).toLowerCase()] }, email);
    if (err) {
      setBusy(false);
      return setNote(err);
    }
    const list = await fetchDestinations();
    setBusy(false);
    onCreated(list);
    const made = list.find((d) => d.name.toLowerCase() === name.toLowerCase());
    if (made) {
      setCountry(made.country);
      onChange(made.id);
    }
    setRegion("");
    setNewCountry("");
    setAdding(false);
    setNote("");
  }

  return (
    <div className="flex min-w-[220px] flex-col gap-1.5">
      <select
        aria-label="Country"
        value={country}
        onChange={(e) => {
          setCountry(e.target.value);
          setAdding(e.target.value === NEW);
          onChange("");
        }}
        className={INPUT}
      >
        <option value="">Country…</option>
        {countries.map((c) => (
          <option key={c}>{c}</option>
        ))}
        <option value={NEW}>+ New country…</option>
      </select>
      {country === NEW && <input aria-label="New country" value={newCountry} onChange={(e) => setNewCountry(e.target.value)} placeholder="Country name" className={INPUT} />}

      {theCountry && !adding && (
        <select aria-label="Region" value={value} onChange={(e) => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value))} className={INPUT}>
          <option value="">Region…</option>
          {regions.map((d) => (
            <option key={d.id} value={d.id}>
              {regionOf(d)}
            </option>
          ))}
          <option value={NEW}>+ New region…</option>
        </select>
      )}
      {adding && (
        <>
          <input aria-label="New region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder={`Region in ${theCountry || "this country"}, e.g. Yunnan. Empty = whole country`} className={INPUT} />
          <div className="flex flex-wrap gap-1.5">
            <Btn small disabled={busy || !theCountry} onClick={() => void create()}>
              {busy ? "Adding…" : "Add to the list"}
            </Btn>
            {country !== NEW && (
              <Btn small kind="s" disabled={busy} onClick={() => setAdding(false)}>
                Back
              </Btn>
            )}
          </div>
        </>
      )}
      {note && <div className="text-[13px] text-[#A3231B]">{note}</div>}
    </div>
  );
}
