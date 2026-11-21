import { type ReactNode, useEffect, useState } from "react";
import { type Pick, builder } from "../../lib/build";

export const INPUT = "min-h-[44px] w-full rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";
export const money = (v: string) => v.replace(/[^0-9.]/g, "");

/** One numbered step of the form. Closed, it shows a one-line summary of what was chosen. */
export function Step({ n, title, summary, open, done, onToggle, children }: { n: number; title: string; summary?: ReactNode; open: boolean; done?: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-line bg-white">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center gap-3 border-0 bg-transparent px-4 py-3.5 text-left sm:px-5">
        <span className={`inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-bold ${done ? "bg-[#17663F] text-white" : open ? "bg-brand text-white" : "bg-ground text-ink"}`}>{done && !open ? "✓" : n}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold leading-tight text-ink">{title}</span>
          {!open && summary && <span className="mt-0.5 block break-words text-[13px] leading-snug text-muted">{summary}</span>}
        </span>
        <span className="flex-none text-[13px] font-semibold text-brand">{open ? "Close" : "Open"}</span>
      </button>
      {open && <div className="flex flex-col gap-4 border-t border-line px-4 py-4 sm:px-5">{children}</div>}
    </section>
  );
}

/** A labelled field with an optional line of help under it. */
export function Fld({ label, hint, htmlFor, children, className = "" }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && <div className="text-xs leading-snug text-muted">{hint}</div>}
    </div>
  );
}

/** A small heading that splits a long step into parts. */
export const Part = ({ children }: { children: ReactNode }) => <h3 className="m-0 border-b border-line pb-1.5 text-[13px] font-bold uppercase tracking-wide text-muted">{children}</h3>;

/** Choose one of a few options, shown as buttons side by side. */
export function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; t: string; d?: string }[]; onChange: (v: T) => void }) {
  const picked = options.find((o) => o.v === value);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={o.v === value} onClick={() => onChange(o.v)} className={`min-h-[44px] rounded-lg border px-3 text-sm ${o.v === value ? "border-brand bg-[#E6F1EE] font-bold text-ink" : "border-[#9AA39E] bg-white font-semibold text-ink"}`}>
            {o.t}
          </button>
        ))}
      </div>
      {picked?.d && <div className="text-xs leading-snug text-muted">{picked.d}</div>}
    </div>
  );
}

/** Tick several of a list. */
export function Ticks({ label, options, value, onChange }: { label: string; options: { v: string; t: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.v);
        return (
          <button key={o.v} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o.v) : [...value, o.v])} className={`min-h-[40px] rounded-full border px-3 text-[13px] ${on ? "border-brand bg-[#E6F1EE] font-bold" : "border-line bg-white"}`}>
            {on ? "✓ " : ""}
            {o.t}
          </button>
        );
      })}
    </div>
  );
}

/** The chosen items, each removable. */
export function Chips({ items, onRemove, empty }: { items: Pick[]; onRemove: (id: string) => void; empty?: string }) {
  if (items.length === 0) return empty ? <div className="text-[13px] text-muted">{empty}</div> : null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <span key={x.id} className="inline-flex items-center gap-1 rounded-full bg-[#E6F1EE] py-1 pl-3 pr-1 text-[13px] font-semibold">
          {x.name}
          <button type="button" aria-label={`Remove ${x.name}`} onClick={() => onRemove(x.id)} className="inline-flex h-7 w-7 items-center justify-center rounded-full border-0 bg-transparent text-base leading-none text-ink">
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

/** Type to search Meta's own list of interests, places or languages, then tap a result to add it. */
export function Finder({ id, type, placeholder, onPick, skip = [] }: { id: string; type: "interest" | "place" | "language"; placeholder: string; onPick: (p: Pick) => void; skip?: string[] }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Pick[]>([]);
  const [state, setState] = useState("");
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setState("");
      return;
    }
    setState("Searching…");
    const timer = setTimeout(async () => {
      const r = await builder<{ results?: Pick[] }>({ action: "search", type, q: term });
      setResults(r.ok ? (r.results ?? []) : []);
      setState(r.ok ? ((r.results ?? []).length ? "" : "Nothing found.") : (r.error ?? "Search failed."));
    }, 450);
    return () => clearTimeout(timer);
  }, [q, type]);
  const shown = results.filter((r) => !skip.includes(r.id));
  return (
    <div className="flex flex-col gap-1">
      <input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={INPUT} autoComplete="off" />
      {state && <div className="text-xs text-muted">{state}</div>}
      {shown.length > 0 && (
        <ul className="m-0 flex max-h-[240px] list-none flex-col divide-y divide-line overflow-y-auto rounded-lg border border-line p-0">
          {shown.map((r) => (
            <li key={`${r.kind ?? ""}${r.id}`}>
              <button type="button" onClick={() => { onPick(r); setQ(""); setResults([]); }} className="flex min-h-[44px] w-full flex-col justify-center border-0 bg-white px-3 py-1.5 text-left">
                <span className="text-sm font-semibold text-ink">{r.name}</span>
                {r.note && <span className="text-xs text-muted">{r.note}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
