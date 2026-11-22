import { type Audience, COUNTRY_CHOICES, FB_POSITIONS, IG_POSITIONS, PLATFORMS, type Pick } from "../../lib/build";
import { Chips, Finder, Fld, INPUT, Part, Seg, Ticks } from "./parts";

const AGES = Array.from({ length: 48 }, (_, i) => 18 + i);

/** Who sees the ads and where they appear. The same choices Ads Manager offers for an ad set. */
export function AudienceForm({ a, set, saved, extras }: { a: Audience; set: (a: Audience) => void; saved: (Pick & { size?: number })[]; extras: string[] }) {
  const up = (patch: Partial<Audience>) => set({ ...a, ...patch });
  const without = (list: Pick[], id: string) => list.filter((x) => x.id !== id);
  const addPlace = (p: Pick) => {
    if (p.kind === "country") return up({ countries: Array.from(new Set([...a.countries, p.country || p.id])) });
    if (p.kind === "region") return up({ regions: [...without(a.regions, p.id), { id: p.id, name: p.name }] });
    up({ cities: [...without(a.cities, p.id), { id: p.id, name: p.name, radius: 25 }] });
  };
  const otherCountries = a.countries.filter((c) => !COUNTRY_CHOICES.some((x) => x.v === c)).map((c) => ({ id: c, name: c }));
  const free = saved.filter((s) => !a.include.some((x) => x.id === s.id) && !a.exclude.some((x) => x.id === s.id));

  return (
    <>
      <Part>Audience</Part>
      <label className="flex min-h-[36px] sm:min-h-[44px] items-start gap-3 rounded-lg bg-ground px-3 py-2.5 text-sm">
        <input type="checkbox" checked={a.advantage} onChange={(e) => up({ advantage: e.target.checked })} className="mt-0.5 h-5 w-5 flex-none" />
        <span>
          <span className="font-bold">Advantage+ audience</span> (what MTB uses). Meta finds buyers by itself and treats the age, interests and saved audiences below as a starting
          point, not a fence. Untick to show the ads only to exactly the people you describe.
        </span>
      </label>

      <Fld label="Places" hint="Tick a country, or search for a state or a city. A country and a state inside it cannot both be chosen: Meta refuses that.">
        <Ticks label="Countries" options={COUNTRY_CHOICES} value={a.countries} onChange={(v) => up({ countries: v })} />
        <Chips items={[...otherCountries, ...a.regions, ...a.cities.map((c) => ({ ...c, name: `${c.name} +${c.radius ?? 25}km` }))]} onRemove={(id) => up({ countries: a.countries.filter((c) => c !== id), regions: without(a.regions, id), cities: without(a.cities, id) })} />
        <Finder id="b-place" type="place" placeholder="Search a state or city, e.g. Selangor, Johor Bahru" onPick={addPlace} skip={[...a.regions, ...a.cities].map((x) => x.id)} />
      </Fld>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Fld label="Age from" htmlFor="b-amin">
          <select id="b-amin" value={a.age_min} onChange={(e) => up({ age_min: Number(e.target.value), age_max: Math.max(a.age_max, Number(e.target.value)) })} className={INPUT}>
            {AGES.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Fld>
        <Fld label="Age to" htmlFor="b-amax">
          <select id="b-amax" value={a.advantage ? 65 : a.age_max} disabled={a.advantage} onChange={(e) => up({ age_max: Number(e.target.value) })} className={INPUT}>
            {AGES.filter((n) => n >= a.age_min).map((n) => (
              <option key={n} value={n}>
                {n === 65 ? "65+" : n}
              </option>
            ))}
          </select>
        </Fld>
        <Fld label="Gender" className="col-span-2 sm:col-span-1">
          <Seg label="Gender" value={a.advantage ? "all" : a.gender} options={[{ v: "all", t: "All" }, { v: "female", t: "Women" }, { v: "male", t: "Men" }]} onChange={(v) => up({ gender: v })} />
        </Fld>
      </div>
      {a.advantage && (a.age_min > 25 || a.gender !== "all" || a.age_max < 65) && (
        <div className="rounded-lg bg-[#FBEFD5] px-3 py-2 text-[13px]">
          With Advantage+ audience Meta allows a minimum age of 25 at most, no upper age and no gender limit. This ad set will be sent as <b>{Math.min(a.age_min, 25)}+, all genders</b>. Untick Advantage+ to
          enforce your exact age and gender.
        </div>
      )}

      <Fld label="Languages" hint="Leave empty for everyone in the places above.">
        <Chips items={a.locales} onRemove={(id) => up({ locales: without(a.locales, id) })} />
        <Finder id="b-lang" type="language" placeholder="Search a language, e.g. Malay" onPick={(p) => up({ locales: [...without(a.locales, p.id), p] })} skip={a.locales.map((x) => x.id)} />
      </Fld>

      <Fld label="Interests" hint="Optional. MTB's best ad sets run broad, with none.">
        <Chips items={a.interests} onRemove={(id) => up({ interests: without(a.interests, id) })} />
        <Finder id="b-int" type="interest" placeholder="Search an interest, e.g. Travel, Umrah, Japan" onPick={(p) => up({ interests: [...without(a.interests, p.id), { id: p.id, name: p.name }] })} skip={a.interests.map((x) => x.id)} />
      </Fld>

      <div className="grid gap-3 sm:grid-cols-2">
        <Fld label="Saved audiences to include" htmlFor="b-inc" hint="Website visitors, lookalikes and lists already in the ad account.">
          <Chips items={a.include} onRemove={(id) => up({ include: without(a.include, id) })} />
          <select id="b-inc" value="" onChange={(e) => { const s = saved.find((x) => x.id === e.target.value); if (s) up({ include: [...a.include, { id: s.id, name: s.name }] }); }} className={INPUT}>
            <option value="">{saved.length ? "Add an audience…" : "None in the ad account"}</option>
            {free.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Fld>
        <Fld label="Saved audiences to exclude" htmlFor="b-exc" hint="For example people who already enquired.">
          <Chips items={a.exclude} onRemove={(id) => up({ exclude: without(a.exclude, id) })} />
          <select id="b-exc" value="" onChange={(e) => { const s = saved.find((x) => x.id === e.target.value); if (s) up({ exclude: [...a.exclude, { id: s.id, name: s.name }] }); }} className={INPUT}>
            <option value="">{saved.length ? "Exclude an audience…" : "None in the ad account"}</option>
            {free.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Fld>
      </div>
      {extras.length > 0 && (
        <div className="rounded-lg bg-ground px-3 py-2 text-[13px]">
          Also copied from the ad set, unchanged: <b>{extras.join(", ")}</b>. There is no field for these here; they are sent to Meta as they were.{" "}
          <button type="button" onClick={() => set({ ...a, base: {} })} className="border-0 bg-transparent p-0 text-[13px] font-semibold text-brand underline">
            Drop them
          </button>
        </div>
      )}

      <Part>Placements</Part>
      <Seg
        label="Placements"
        value={a.placements.mode}
        options={[
          { v: "auto", t: "Advantage+ (all)", d: "Meta shows the ad wherever it gets the cheapest results: Facebook, Instagram, Threads, Messenger and more. What MTB uses." },
          { v: "core", t: "Feeds, Stories, Reels", d: "Only Facebook and Instagram feeds, Stories and Reels." },
          { v: "manual", t: "Choose myself", d: "Pick the platforms and positions one by one." },
        ]}
        onChange={(v) => up({ placements: { ...a.placements, mode: v } })}
      />
      {a.placements.mode === "manual" && (
        <div className="flex flex-col gap-3 rounded-lg bg-ground px-3 py-3">
          <Fld label="Platforms">
            <Ticks label="Platforms" options={PLATFORMS} value={a.placements.platforms} onChange={(v) => up({ placements: { ...a.placements, platforms: v } })} />
          </Fld>
          {a.placements.platforms.includes("facebook") && (
            <Fld label="Facebook positions" hint="None ticked means all Facebook positions.">
              <Ticks label="Facebook positions" options={FB_POSITIONS} value={a.placements.facebook} onChange={(v) => up({ placements: { ...a.placements, facebook: v } })} />
            </Fld>
          )}
          {a.placements.platforms.includes("instagram") && (
            <Fld label="Instagram positions" hint="None ticked means all Instagram positions.">
              <Ticks label="Instagram positions" options={IG_POSITIONS} value={a.placements.instagram} onChange={(v) => up({ placements: { ...a.placements, instagram: v } })} />
            </Fld>
          )}
          <Fld label="Devices" hint="Both, or only one.">
            <Ticks label="Devices" options={[{ v: "mobile", t: "Phones" }, { v: "desktop", t: "Computers" }]} value={a.placements.devices} onChange={(v) => up({ placements: { ...a.placements, devices: v } })} />
          </Fld>
        </div>
      )}
    </>
  );
}
