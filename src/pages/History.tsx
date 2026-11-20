import { useMemo, useState } from "react";
import { Card, PageHead, Pill, type Tone } from "../components/ui";
import { PERIODS, period, useRpc } from "../lib/live";

type Item = { at: string; day: string; who: string; kind: "person" | "ai" | "meta" | "system"; title: string; detail: string | null; ok: boolean };

const KIND: Record<Item["kind"], { label: string; tone: Tone }> = {
  person: { label: "Staff", tone: "n" },
  ai: { label: "AI", tone: "t" },
  meta: { label: "Meta change", tone: "a" },
  system: { label: "Automatic", tone: "n" },
};
const FILTERS = ["Everything", "Meta changes", "Staff", "AI", "Automatic"];
const FILTER_KIND: Record<string, Item["kind"] | null> = { Everything: null, "Meta changes": "meta", Staff: "person", AI: "ai", Automatic: "system" };

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
const dayName = (d: string) => new Date(`${d}T12:00:00+08:00`).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" });

/** Everything that happened, day by day: staff actions, AI work and every change made in Meta. */
export default function History() {
  const [label, setLabel] = useState("Last 7 days");
  const [filter, setFilter] = useState("Everything");
  const [who, setWho] = useState("Everyone");
  const range = useMemo(() => period(label), [label]);
  const { data, loading } = useRpc<Item[]>("history_feed", { p_from: range.from, p_to: range.to }, []);

  const people = useMemo(() => ["Everyone", ...Array.from(new Set(data.map((i) => i.who))).sort()], [data]);
  const shown = data.filter((i) => (!FILTER_KIND[filter] || i.kind === FILTER_KIND[filter]) && (who === "Everyone" || i.who === who));
  const days = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const i of shown) map.set(i.day, [...(map.get(i.day) ?? []), i]);
    return Array.from(map.entries());
  }, [shown]);

  const pick = (id: string, text: string, value: string, set: (v: string) => void, options: string[]) => (
    <label className="flex flex-col gap-1 text-[13px] font-semibold" htmlFor={id}>
      {text}
      <select id={id} value={value} onChange={(e) => set(e.target.value)} className="min-h-[40px] rounded-lg border border-line bg-white px-2.5 text-sm font-normal">
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        title="History"
        sub="Everything that happened, day by day: what staff did, what the AI staff did, and every change made in Meta. Times are Malaysia time."
        right={
          <div className="flex flex-wrap gap-2.5">
            {pick("h-period", "Period", label, setLabel, PERIODS)}
            {pick("h-kind", "Show", filter, setFilter, FILTERS)}
            {pick("h-who", "By", who, setWho, people)}
          </div>
        }
      />
      {loading && <div className="text-sm text-muted">Loading…</div>}
      {!loading && days.length === 0 && (
        <Card>
          <div className="text-sm">Nothing recorded for this period{filter !== "Everything" || who !== "Everyone" ? " with these filters" : ""}.</div>
        </Card>
      )}
      {days.map(([day, items]) => {
        const meta = items.filter((i) => i.kind === "meta").length;
        return (
          <Card key={day}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-base font-bold">{dayName(day)}</h2>
              <Pill>{items.length} {items.length === 1 ? "entry" : "entries"}</Pill>
              {meta > 0 && <Pill tone="a">{meta} Meta {meta === 1 ? "change" : "changes"}</Pill>}
            </div>
            <ul className="m-0 mt-2 list-none divide-y divide-line p-0">
              {items.map((i, n) => (
                <li key={`${i.at}-${n}`} className="grid grid-cols-[52px_1fr] gap-x-3 py-2 text-sm">
                  <span className="pt-0.5 text-[13px] tabular-nums text-muted">{time(i.at)}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold">{i.who}</span>
                      <Pill tone={i.ok ? KIND[i.kind].tone : "r"}>{i.ok ? KIND[i.kind].label : "Failed"}</Pill>
                    </div>
                    <div className="break-words">{i.title}</div>
                    {i.detail && <div className="break-words text-[13px] text-muted">{i.detail}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
